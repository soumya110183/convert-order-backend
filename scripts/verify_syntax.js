
import mongoose from 'mongoose';
import * as OrderController from '../controllers/orderController.js';
import * as AdminController from '../controllers/admin/adminController.js';

console.log('✅ Successfully imported controllers. Syntax check passed.');
console.log('OrderController exports:', Object.keys(OrderController));
console.log('AdminController exports:', Object.keys(AdminController));
process.exit(0);
