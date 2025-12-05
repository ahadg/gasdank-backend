# User Data Cleanup API

## Overview
This endpoint allows authorized users to completely clean/reset all data associated with a specific user ID. This is useful for testing, demo accounts, or resetting a user's account to a clean state.

## Endpoint
```
DELETE /api/users/clean-data/:user_id
```

## Authentication & Authorization
- **Requires**: JWT Authentication
- **Requires**: `config.users` delete access permission
- **Typically**: Only accessible by admin or superadmin users

## What Gets Deleted

The following data is permanently deleted for the specified user:

1. **Activities** - All activity logs where user is the actor or creator
2. **Buyers** - All buyer/client records associated with the user
3. **Expenses** - All expense records
4. **Inventory** - All inventory items
5. **Notifications** - All notifications (sent or received)
6. **Samples** - All sample records
7. **SampleViewingClients** - All sample viewing client records
8. **TransactionItems** - All transaction line items
9. **TransactionPayments** - All payment records
10. **Transactions** - All transaction records

## What Gets Reset

The user account itself is NOT deleted, but the following fields are reset:
- `cash_balance` → 0
- `other_balance` → {} (empty object)

## Request Example

```bash
curl -X DELETE \
  http://localhost:3000/api/users/clean-data/507f1f77bcf86cd799439011 \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

## Response Example

### Success Response (200 OK)
```json
{
  "message": "User data cleanup completed",
  "user_id": "507f1f77bcf86cd799439011",
  "deleted": {
    "activities": 45,
    "buyers": 12,
    "expenses": 8,
    "inventory": 23,
    "notifications": 15,
    "samples": 5,
    "sampleViewingClients": 3,
    "transactionItems": 67,
    "transactionPayments": 34,
    "transactions": 34
  },
  "userBalancesReset": true,
  "updatedUser": {
    "cash_balance": 0,
    "other_balance": {}
  },
  "errors": []
}
```

### Error Response (404 Not Found)
```json
{
  "error": "User not found"
}
```

### Error Response (400 Bad Request)
```json
{
  "error": "user_id parameter is required"
}
```

### Partial Success Response
If some deletions fail but others succeed, you'll get a 200 response with errors array populated:
```json
{
  "message": "User data cleanup completed",
  "user_id": "507f1f77bcf86cd799439011",
  "deleted": {
    "activities": 45,
    "buyers": 12,
    // ... other counts
  },
  "userBalancesReset": true,
  "updatedUser": {
    "cash_balance": 0,
    "other_balance": {}
  },
  "errors": [
    {
      "model": "Inventory",
      "error": "Some error message"
    }
  ]
}
```

## Important Notes

⚠️ **WARNING**: This operation is **IRREVERSIBLE**. All data will be permanently deleted.

### Best Practices:
1. **Backup First**: Always backup data before running cleanup
2. **Confirm User ID**: Double-check the user_id before executing
3. **Test Environment**: Test in development environment first
4. **User Notification**: Notify users before cleaning their data
5. **Audit Trail**: An activity log is created after cleanup

### Use Cases:
- Resetting demo accounts
- Cleaning test data
- User requested data deletion
- Account reset for troubleshooting
- Preparing accounts for new trials

### What's NOT Deleted:
- The user account itself
- User credentials (email, password)
- User settings and preferences
- User role and permissions
- Created_at timestamp

## Activity Logging

After successful cleanup, an activity record is created with:
- **type**: `user_data_cleanup`
- **action**: `delete`
- **resource_type**: `user_data`
- **description**: "All data cleaned for user {email}"

## Error Handling

The endpoint uses a try-catch pattern for each model deletion. If one model fails, the others will still be attempted. Check the `errors` array in the response to see if any deletions failed.
