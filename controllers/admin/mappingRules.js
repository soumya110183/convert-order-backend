import MappingRule from "../../models/mappingRules.js";

/* ---------------- GET ALL RULES ---------------- */
export const getMappingRules = async (req, res, next) => {
  try {
    const rules = await MappingRule.find().sort({ updatedAt: -1 });

    res.json({
      success: true,
      rules,
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------- CREATE RULE ---------------- */
export const createMappingRule = async (req, res, next) => {
  try {
    const rule = await MappingRule.create({
      ...req.body,
      updatedBy: req.user.email,
    });

    res.status(201).json({
      success: true,
      rule,
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------- UPDATE RULE ---------------- */
export const updateMappingRule = async (req, res, next) => {
  try {
    const rule = await MappingRule.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updatedBy: req.user.email,
      },
      { new: true }
    );

    res.json({
      success: true,
      rule,
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------- DELETE RULE ---------------- */
export const deleteMappingRule = async (req, res, next) => {
  try {
    await MappingRule.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Mapping rule deleted",
    });
  } catch (err) {
    next(err);
  }
};
