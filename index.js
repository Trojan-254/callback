require('dotenv').config(); // Load environment variables

const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Model import
const Order = require('./models/Order');

// Middleware to parse JSON
app.use(express.json()); // Express 4.16+ has built-in JSON parsing

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// M-Pesa callback handler
app.post('/payments/mpesa/callback', async (req, res) => {
  try {
    const { Body: { stkCallback } } = req.body;

    // Find the order based on CheckoutRequestID
    const order = await Order.findOne({
      'mpesaDetails.checkoutRequestID': stkCallback.CheckoutRequestID,
    });

    // If order is not found, return an error
    if (!order) {
      console.error('Order not found for CheckoutRequestID:', stkCallback.CheckoutRequestID);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Process payment based on ResultCode
    if (stkCallback.ResultCode === 0) {
      // Payment successful
      const mpesaReceipt = stkCallback.CallbackMetadata.Item.find(
        item => item.Name === 'MpesaReceiptNumber'
      )?.Value;

      order.paymentStatus = 'completed';
      order.orderStatus = 'processing';
      order.mpesaDetails.mpesaReceiptNumber = mpesaReceipt;
      order.mpesaDetails.paymentCompletedAt = new Date();
    } else {
      // Payment failed
      order.paymentStatus = 'failed';
      order.mpesaDetails.failureReason = stkCallback.ResultDesc;
    }

    // Save the updated order
    await order.save();

    // Respond to M-Pesa with success
    res.json({ success: true });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    // Return an internal server error response
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
