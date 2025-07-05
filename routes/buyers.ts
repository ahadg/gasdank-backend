import { Router, Request, Response } from 'express';
import Buyer from '../models/Buyer';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import { createActivity } from './activity';

const router = Router();


// ✅ Example 1: Update by Email
// json
// Copy
// Edit
// {
//   "identifier": "niaz@gmail.com",
//   "phone": "03001234567",
//   "currentBalance": 1200
// }
// ✅ Example 2: Update by First Name
// json
// Copy
// Edit
// {
//   "identifier": "Niaz",
//   "lastName": "Ahmed",
//   "startingBalance": 1500
// }
// ✅ Example 3: Update by Last Name
// json
// Copy
// Edit
// {
//   "identifier": "Ahmed",
//   "email": "newemail@example.com"
// }
router.put('/aiedit', async (req: Request, res: Response) => {
  try {
    const { identifier, ...updateFields } = req.body;

    if (!identifier) {
      return res.status(400).json({ error: 'Missing identifier (email, firstName, or lastName)' });
    }

    // Determine the search field based on identifier format
    let query: any = {};

    if (typeof identifier === 'string') {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

      if (isEmail) {
        query.email = identifier;
      } else {
        // Fallback to searching both firstName and lastName
        query = {
          $or: [
            { firstName: identifier },
            { lastName: identifier }
          ]
        };
      }
    } else {
      return res.status(400).json({ error: 'Identifier must be a string (email, firstName, or lastName)' });
    }

    const updatedBuyer = await Buyer.findOneAndUpdate(query, updateFields, { new: true });

    if (!updatedBuyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }

    res.status(200).json(updatedBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/buyers - Create a new buyer
router.post('/', async (req: Request, res: Response) => {
  try {
    const requiredFields = ['user_id', 'firstName', 
     // 'lastName', 'email', 'phone'
    ];

    // Check if all required fields are present
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const { email } = req.body;

    // Check if a buyer with the same email already exists
    // const existingBuyer = await Buyer.findOne({ email });
    // if (existingBuyer) {
    //   return res.status(400).json({ error: 'A buyer with this email already exists.' });
    // }

    // Assign currentBalance and startingBalance if balance is provided
    if ('balance' in req.body || (!req.body.currentBalance || !req.body.startingBalance)) {
      req.body.currentBalance = req.body.currentBalance ? req.body.balance : 0;
      req.body.startingBalance = req.body.startingBalance ? req.body.balance : 0;
    }

    // // Final validation
    // if (!req.body.currentBalance || !req.body.startingBalance) {
    //   return res.status(400).json({ error: 'Missing required field: currentBalance or startingBalance' });
    // }

    const newBuyer = new Buyer(req.body);
    await newBuyer.save();
    createActivity({
      user_id : req.body?.user_id, 
      //user_created_by: user_created_by_id,
      action: 'create',
      resource_type: 'buyer',
      page: 'buyer',
      type: 'client_created',
      description : `${req.body.firstName} ${req.body.lastName} client created`,
    });
    res.status(201).json(newBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


router.use(authenticateJWT);



// GET /api/buyers - List all buyers or filter by "user_id" id (assumed as UID)
router.get('/',checkAccess("wholesale","read"), async (req: Request, res: Response) => {
  try {
    // If a query parameter "UID" is provided, filter by it.
    const { user_id } = req.query;
    let buyers;
    if (user_id) {
      buyers = await Buyer.find({ user_id });
    } else {
      buyers = await Buyer.find();
    }
    res.status(200).json(buyers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers/:buyerid - Get buyers by id
router.get('/:buyerid', async (req: Request, res: Response) => {
  try {
    const buyer = await Buyer.findById(req.params.buyerid);
    if (!buyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json(buyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/buyers/:id - Update a buyer by ID
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updatedBuyer = await Buyer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBuyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json(updatedBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});




// DELETE /api/buyers/:id - Delete a buyer by ID (optional)
router.delete('/:id',checkAccess("wholesale","delete"), async (req: Request, res: Response) => {
  try {
    const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
    if (!deletedBuyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json({ message: 'Buyer deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers/transaction/:id - Delete a buyer by ID (optional)
router.get('/:id', async (req: Request, res: Response) => {
    try {
      const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
      if (!deletedBuyer) {
        return res.status(404).json({ message: 'Buyer not found' });
      }
      res.status(200).json({ message: 'Buyer deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// GET /api/buyers/:id - Delete a buyer by ID (optional)
router.post('/balance/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body
    await Buyer.findByIdAndUpdate(req.params.id, { $inc: { currentBalance: body?.currentBalance } });
    res.status(200).json({ message: 'Buyer balance updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// // GET /api/buyers/products/:id - Delete a buyer by ID (optional)
// router.get('/:id', async (req: Request, res: Response) => {
//     try {
//       const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
//       if (!deletedBuyer) {
//         return res.status(404).json({ message: 'Buyer not found' });
//       }
//       res.status(200).json({ message: 'Buyer deleted successfully' });
//     } catch (error: any) {
//       res.status(500).json({ error: error.message });
//     }
// });

// GET /api/buyers/products/:id - Delete a buyer by ID (optional)
// router.get('/:activereciept', async (req: Request, res: Response) => {
//   try {
//     const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
//     if (!deletedBuyer) {
//       return res.status(404).json({ message: 'Buyer not found' });
//     }
//     res.status(200).json({ message: 'Buyer deleted successfully' });
//   } catch (error: any) {
//     res.status(500).json({ error: error.message });
//   }
// });

export default router;
