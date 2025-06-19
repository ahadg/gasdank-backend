import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import Notification from "../models/notification";
import twilio from 'twilio';
import Buyer from '../models/Buyer';

const router = Router();

// Protect all notification endpoints
router.use(authenticateJWT);

// Initialize Twilio client
export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Helper function to create notification record
export const createNotification = async (obj: any) => {
  const newNotification = new Notification(obj);
  await newNotification.save();
  return newNotification;
}

// Format phone number for Twilio (ensure it starts with country code)
const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If it doesn't start with country code, assume US (+1)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  
  return cleaned;
}

// Generate message content based on notification type
const generateMessage = (type: 'outstanding' | 'product', customMessage: string, data: any): string => {
  if (customMessage) {
    return customMessage;
  }

  if (type === 'outstanding') {
    const balance = Math.abs(Number(data.balance));
    return `Payment Reminder: You have an outstanding balance of $${balance.toLocaleString()} that needs to be paid. Please contact us to arrange payment.`;
  } else if (type === 'product') {
    const productName = data.product?.name || 'New Product';
    const productPrice = data.product?.price ? ` - $${data.product.price}` : '';
    return `New Product Available: ${productName}${productPrice}. Contact us for more details and to place your order.`;
  }

  return 'You have received a notification from your wholesale supplier.';
}

// POST /api/notifications/send - Send bulk notifications
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { recipients, type, message, product } = req.body;
    const user_id = (req as any).user?.id || (req as any).user?._id;

    // Validation
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ 
        error: 'Recipients array is required and must not be empty' 
      });
    }

    if (!type || !['outstanding', 'product'].includes(type)) {
      return res.status(400).json({ 
        error: 'Type must be either "outstanding" or "product"' 
      });
    }

    if (type === 'product' && !product) {
      return res.status(400).json({ 
        error: 'Product information is required for product notifications' 
      });
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(500).json({ 
        error: 'Twilio configuration is missing. Please check environment variables.' 
      });
    }

    const results: {
      successful: Array<{
        recipient_id: any;
        name: string;
        phone: string;
        sms_sid?: string;
        notification_id: any;
      }>;
      failed: Array<{
        recipient_id: any;
        name: string;
        phone: string;
        error: string;
        notification_id?: any;
      }>;
      total: number;
    } = {
      successful: [],
      failed: [],
      total: recipients.length
    };

    // Process each recipient
    for (const recipient of recipients) {
      try {
        const { id, email, name, balance, phone } = recipient;

        // Generate message content
        const messageContent = generateMessage(type, message, { 
          balance, 
          product,
          name 
        });

        let smsResult = null;
        let notificationData: any = {
          user_id,
          recipient_id: id,
          recipient_name: name,
          recipient_email: email,
          type,
          message: messageContent,
          status: 'pending',
          created_at: new Date()
        };

        // Add product info for product notifications
        if (type === 'product' && product) {
          notificationData.product_id = product._id;
          notificationData.product_name = product.name;
          notificationData.product_price = product.price;
        }

        // Add balance info for outstanding notifications
        if (type === 'outstanding') {
          notificationData.outstanding_balance = balance;
        }

        // Send SMS if phone number is available
        if (phone) {
          const formattedPhone = formatPhoneNumber(phone);
          
          if (formattedPhone) {
            try {
              smsResult = await twilioClient.messages.create({
                body: messageContent,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone
              });

              notificationData.sms_sid = smsResult.sid;
              notificationData.sms_status = smsResult.status;
              notificationData.phone_number = formattedPhone;
              notificationData.status = 'sent';
              notificationData.sent_at = new Date();
              
            } catch (smsError: any) {
              if (smsError.code === 21408) {
                return res.status(400).json({
                  success: false,
                  error: 'SMS sending is not enabled for the destination country.',
                  suggestion: 'Enable SMS permissions for this country in your Twilio Console: https://www.twilio.com/console/sms/settings/geo-permissions'
                });
              }
              console.error(`SMS Error for ${name} (${formattedPhone}):`, smsError);
              notificationData.status = 'failed';
              notificationData.error_message = smsError.message;
              notificationData.phone_number = formattedPhone;
            }
          } else {
            notificationData.status = 'failed';
            notificationData.error_message = 'Invalid phone number format';
          }
        } else {
          notificationData.status = 'failed';
          notificationData.error_message = 'No phone number provided';
        }

        // Save notification to database
        const savedNotification = await createNotification(notificationData);

        if (notificationData.status === 'sent') {
          results.successful.push({
            recipient_id: id,
            name,
            phone: notificationData.phone_number,
            sms_sid: smsResult?.sid,
            notification_id: savedNotification._id
          });
        } else {
          results.failed.push({
            recipient_id: id,
            name,
            phone: phone || 'N/A',
            error: notificationData.error_message,
            notification_id: savedNotification._id
          });
        }

      } catch (error: any) {
        console.error(`Error processing recipient ${recipient.name}:`, error);
        results.failed.push({
          recipient_id: recipient.id,
          name: recipient.name,
          phone: recipient.phone || 'N/A',
          error: error.message || 'Unknown error occurred'
        });
      }
    }

    // Return results
    const response = {
      message: `Processed ${results.total} notifications`,
      results: {
        successful: results.successful.length,
        failed: results.failed.length,
        total: results.total
      },
      details: results
    };

    // Return appropriate status code
    if (results.successful.length === 0) {
      return res.status(207).json({ // Multi-status for partial success
        ...response,
        warning: 'No notifications were sent successfully'
      });
    } else if (results.failed.length > 0) {
      return res.status(207).json({ // Multi-status for partial success
        ...response,
        warning: 'Some notifications failed to send'
      });
    } else {
      return res.status(200).json(response);
    }

  } catch (error: any) {
    console.error('Bulk notification error:', error);
    res.status(500).json({ 
      error: 'Failed to process notifications',
      details: error.message 
    });
  }
});

// POST /api/notification/send-invoice/:buyer_id - Send invoice SMS to specific client
router.post('/send-invoice/:buyer_id', async (req: Request, res: Response) => {
  try {
    const { buyer_id } = req.params;
    const { 
      customMessage, 
      totalAmount, 
      dueAmount, 
      transactionCount,
      dateRange 
    } = req.body;
    const user_id = (req as any).user?.id || (req as any).user?._id;

    // Validation
    if (!buyer_id) {
      return res.status(400).json({ 
        error: 'Client ID is required' 
      });
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(500).json({ 
        error: 'Twilio configuration is missing. Please check environment variables.' 
      });
    }

    // You'll need to fetch client details from your database
    // Assuming you have a User/Client model - adjust the import and model name accordingly
    // import User from "../models/user"; // Adjust path as needed
    
    // For now, I'll show the structure - you'll need to replace this with your actual client fetching logic
    const client = await Buyer.findById(buyer_id); // Replace 'User' with your actual client model
    
    if (!client) {
      return res.status(404).json({ 
        error: 'Client not found' 
      });
    }

    const { name, phone, email } = client;

    if (!phone) {
      return res.status(400).json({ 
        error: 'Client phone number not found' 
      });
    }

    // Generate invoice message
    const generateInvoiceMessage = (customMsg?: string): string => {
      if (customMsg) {
        return customMsg;
      }

      const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      
      let message = `Invoice Summary for ${name}:\n`;
      
      if (dateRange) {
        message += `Period: ${dateRange}\n`;
      }
      
      if (transactionCount) {
        message += `Transactions: ${transactionCount}\n`;
      }
      
      if (totalAmount !== undefined) {
        message += `Total Sales: ${formatCurrency(totalAmount)}\n`;
      }
      
      if (dueAmount !== undefined) {
        const status = dueAmount > 0 ? 'Outstanding' : dueAmount < 0 ? 'Credit' : 'Paid';
        message += `Amount ${status}: ${formatCurrency(Math.abs(dueAmount))}\n`;
      }
      
      message += `\nPlease contact us for any questions regarding your account.`;
      
      return message;
    };

    const messageContent = generateInvoiceMessage(customMessage);
    const formattedPhone = formatPhoneNumber(phone);

    if (!formattedPhone) {
      return res.status(400).json({ 
        error: 'Invalid phone number format' 
      });
    }

    let notificationData: any = {
      user_id,
      buyer_id: buyer_id,
      recipient_name: name,
      recipient_email: email,
      type: 'invoice',
      message: messageContent,
      phone_number: formattedPhone,
      status: 'pending',
      created_at: new Date()
    };

    // Add invoice-specific data
    if (totalAmount !== undefined) notificationData.invoice_total = totalAmount;
    if (dueAmount !== undefined) notificationData.invoice_due = dueAmount;
    if (transactionCount !== undefined) notificationData.transaction_count = transactionCount;
    if (dateRange) notificationData.date_range = dateRange;

    try {
      // Send SMS
      const smsResult = await twilioClient.messages.create({
        body: messageContent,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone
      });

      notificationData.sms_sid = smsResult.sid;
      notificationData.sms_status = smsResult.status;
      notificationData.status = 'sent';
      notificationData.sent_at = new Date();

      // Save notification to database
      const savedNotification = await createNotification(notificationData);

      res.status(200).json({
        success: true,
        message: 'Invoice SMS sent successfully',
        data: {
          recipient: name,
          phone: formattedPhone,
          sms_sid: smsResult.sid,
          notification_id: savedNotification._id,
          message_preview: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '')
        }
      });

    } catch (smsError: any) {
      console.error(`SMS Error for ${name} (${formattedPhone}):`, smsError);
      console.log(smsError);
      console.log(typeof(smsError));
      
      notificationData.status = 'failed';
      notificationData.error_message = smsError;

      // Save failed notification to database
      const savedNotification = await createNotification(notificationData);

      if (smsError.code === 21408) {
        return res.status(400).json({
          success: false,
          error: 'SMS sending is not enabled for the destination country.',
          suggestion: 'Enable SMS permissions for this country in your Twilio Console: https://www.twilio.com/console/sms/settings/geo-permissions'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to send SMS',
        details: smsError,
        data: {
          recipient: name,
          phone: formattedPhone,
          notification_id: savedNotification._id
        }
      });
    }

  } catch (error: any) {
    console.error('Invoice SMS error:', error);
    res.status(500).json({ 
      error: 'Failed to send invoice SMS',
      details: error.message 
    });
  }
});

// GET /api/notifications/history/:user_id - Get notification history
router.get('/history/:user_id', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const { page = 1, limit = 50, type, status } = req.query;

    const query: any = { user_id };
    
    if (type) query.type = type;
    if (status) query.status = status;

    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notifications/stats/:user_id - Get notification statistics
router.get('/stats/:user_id', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const stats = await Notification.aggregate([
      { $match: { user_id } },
      {
        $group: {
          _id: {
            type: '$type',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notifications/:user_id - Create single notification (existing endpoint)
router.post('/:user_id', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const newNotification = new Notification({
      user_id,
      ...req.body
    });
    await newNotification.save();
    res.status(201).json(newNotification);
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;