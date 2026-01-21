import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function testDashboard() {
    try {
        console.log("Testing /api/admin/master/dashboard endpoint...");
        
        const res = await axios.get("http://localhost:5000/api/admin/master/dashboard", {
            headers: {
                "Content-Type": "application/json"
            }
        });
        
        console.log("\n\u2705 SUCCESS:");
        console.log(JSON.stringify(res.data, null, 2));
        
        console.log("\n\ud83d\udcca Stats Summary:");
        console.log(`  - Total Users: ${res.data.users?.total || 0}`);
        console.log(`  - Total Uploads: ${res.data.uploads?.total || 0}`);
        console.log(`  - Success Rate: ${res.data.uploads?.successRate || 0}%`);
        console.log(`  - Customers: ${res.data.masterData?.customers || 0}`);
        console.log(`  - Products: ${res.data.masterData?.products || 0}`);
        console.log(`  - Schemes: ${res.data.masterData?.schemes || 0}`);
        
    } catch (err) {
        console.error("\u274c ERROR:", err.response?.data || err.message);
        console.error("Status:", err.response?.status);
    }
}

testDashboard();
