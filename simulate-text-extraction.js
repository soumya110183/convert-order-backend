
import { detectCustomerFromInvoice } from './services/customerDetector.js';

const textFileContent = `M                              ATTUPURAM ENTERPRISES
15/89G&H ,FSSAI.21315222000119 " APN ATRIUM " ,UDAYA NAGAR KOZHIKODE ROAD ,   MANJERI -
                     Order Form (MICRO LABS) Dated 31/12/2025
No. :577                                   Date : 31/12/2025                      
MICRO LABS LTD.                                                                   
RAJ DISTRIBUTORS 40/1364  T.D ROAD                                                
ERNAKULAM                                                                         
Dear Sir                            I N D E N T                                   
      Kindly send us the following products as per the details given below.
----------------------------------------------------------------------------------
Code     Product                                  Pack             Order          
----------------------------------------------------------------------------------
`;

// Simulate unifiedParser splitting into lines
const rows = textFileContent.split('\n');

console.log("🧪 Testing Customer Detection on Text Snippet...\n");
const customer = detectCustomerFromInvoice(rows);

console.log(`\n🎯 Detected Customer: "${customer}"`);

if (customer === "Attupuram Enterprises") {
    console.log("✅ SUCCESS");
} else {
    console.log("❌ FAILURE");
}
