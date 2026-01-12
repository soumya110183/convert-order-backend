/**
 * ADMIN EXPORT CONTROLLER
 * Exports all converted orders in the exact 8-column template format
 */

import MasterOrder from "../../models/masterOrder.js";
import XLSX from "xlsx";

const TEMPLATE_COLUMNS = [
  "CODE",
  "CUSTOMER NAME",
  "SAPCODE",
  "ITEMDESC",
  "ORDERQTY",
  "BOX PACK",
  "PACK",
  "DVN"
];

export const exportAllConvertedData = async (req, res) => {
  try {
    // 🔐 Admin-only check
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied. Admin only." 
      });
    }

    console.log("📥 Admin export initiated by:", req.user.email);

    // Fetch ALL orders from Master DB (already deduplicated)
    const masterOrders = await MasterOrder.find()
      .sort({ customerName: 1, itemdesc: 1 })
      .lean();

    if (!masterOrders.length) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ["NO DATA AVAILABLE"],
        ["Please upload and convert orders first"]
      ]);

      XLSX.utils.book_append_sheet(wb, ws, "Info");

      const buffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx"
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="pharma_orders_empty.xlsx"'
      );

      return res.send(buffer);
    }

    console.log(`📊 Found ${masterOrders.length} unique orders in master DB`);

    // ✅ Transform to EXACT template format (8 columns only)
    const exportRows = masterOrders.map(order => ({
      "CODE": order.code || "",
      "CUSTOMER NAME": order.customerName || "",
      "SAPCODE": order.sapcode || "",
      "ITEMDESC": order.itemdesc || "",
      "ORDERQTY": order.orderqty || 0,
      "BOX PACK": order.boxPack || 0,
      "PACK": order.pack || 0,
      "DVN": order.dvn || ""
    }));

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // ✅ Use EXACT template columns (no extra columns)
    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: TEMPLATE_COLUMNS
    });

    // Apply column widths (exact same as user downloads)
    worksheet["!cols"] = [
      { wch: 10 },  // CODE
      { wch: 30 },  // CUSTOMER NAME
      { wch: 12 },  // SAPCODE
      { wch: 50 },  // ITEMDESC
      { wch: 12 },  // ORDERQTY
      { wch: 12 },  // BOX PACK
      { wch: 10 },  // PACK
      { wch: 15 }   // DVN
    ];

    // Apply professional styling (exact same as user downloads)
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    
    const headerStyle = {
      font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F4E79" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "medium", color: { rgb: "000000" } },
        bottom: { style: "medium", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    const cellStyle = {
      font: { sz: 11 },
      alignment: { vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "CCCCCC" } },
        bottom: { style: "thin", color: { rgb: "CCCCCC" } },
        left: { style: "thin", color: { rgb: "CCCCCC" } },
        right: { style: "thin", color: { rgb: "CCCCCC" } }
      }
    };

    const altRowStyle = {
      ...cellStyle,
      fill: { fgColor: { rgb: "F2F2F2" } }
    };

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellRef]) continue;

        if (R === 0) {
          // Header row
          worksheet[cellRef].s = headerStyle;
        } else {
          // Data rows with alternating colors
          worksheet[cellRef].s = (R % 2 === 0) ? cellStyle : altRowStyle;
        }
      }
    }

    // Freeze header row
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    // Add autofilter
    worksheet["!autofilter"] = {
      ref: `A1:${XLSX.utils.encode_col(range.e.c)}1`
    };

    // Set row heights
    worksheet["!rows"] = [{ hpt: 25 }];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Order Training"  // ✅ Same sheet name as user downloads
    );

    // Generate Excel buffer
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    });

    // Send to admin
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `pharma_orders_master_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    console.log(`✅ Exporting ${exportRows.length} unique orders to admin`);

    res.send(buffer);

  } catch (err) {
    console.error("❌ Admin export failed:", err);
    res.status(500).json({ 
      success: false,
      message: "Export failed. Please try again." 
    });
  }
};

/**
 * Get Master Database Statistics
 */
export const getMasterStats = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const [
      totalOrders,
      totalCustomers,
      totalProducts,
      totalQuantity,
      recentOrders,
      topCustomers,
      topProducts
    ] = await Promise.all([
      MasterOrder.countDocuments(),
      
      MasterOrder.distinct("customerName").then(arr => arr.length),
      
      MasterOrder.distinct("itemdesc").then(arr => arr.length),
      
      MasterOrder.aggregate([
        { $group: { _id: null, total: { $sum: "$orderqty" } } }
      ]).then(result => result[0]?.total || 0),
      
      MasterOrder.find()
        .sort({ lastUpdatedAt: -1 })
        .limit(10)
        .select("customerName itemdesc orderqty uploadCount lastUpdatedAt")
        .lean(),
      
      MasterOrder.aggregate([
        {
          $group: {
            _id: "$customerName",
            totalQty: { $sum: "$orderqty" },
            totalOrders: { $sum: "$uploadCount" },
            uniqueProducts: { $addToSet: "$itemdesc" }
          }
        },
        { 
          $project: {
            customer: "$_id",
            totalQty: 1,
            totalOrders: 1,
            uniqueProducts: { $size: "$uniqueProducts" }
          }
        },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
      ]),
      
      MasterOrder.aggregate([
        {
          $group: {
            _id: "$itemdesc",
            totalQty: { $sum: "$orderqty" },
            uploadCount: { $sum: "$uploadCount" }
          }
        },
        { 
          $project: {
            product: "$_id",
            totalQty: 1,
            uploadCount: 1
          }
        },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalCustomers,
        totalProducts,
        totalQuantity,
      },
      recentOrders,
      topCustomers,
      topProducts
    });

  } catch (err) {
    console.error("❌ Master stats error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to load statistics" 
    });
  }
};