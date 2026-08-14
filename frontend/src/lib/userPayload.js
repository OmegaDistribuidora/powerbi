export function buildUserPayload(form, options = {}) {
  const activeReportIds = options.activeReportIds || new Set();
  const extraAllowedReportIds = new Set((options.extraAllowedReportIds || []).map(Number));
  const isAllowedReportId = (reportId) => activeReportIds.has(reportId) || extraAllowedReportIds.has(reportId);

  if (form.role === "ADMIN") {
    return {
      ...form,
      reportIds: [],
      moduleAccess: [],
      filterRules: []
    };
  }

  if (!Array.isArray(form.moduleAccess)) {
    throw new TypeError("moduleAccess deve ser informado ao atualizar um usuario.");
  }

  return {
    ...form,
    reportIds: form.reportIds.filter((reportId) => isAllowedReportId(reportId)),
    moduleAccess: form.moduleAccess,
    filterRules: form.filterRules
      .filter(
        (rule) =>
          rule.tableName &&
          rule.columnName &&
          rule.value &&
          (rule.reportId == null || isAllowedReportId(Number(rule.reportId)))
      )
      .map((rule) => ({
        reportId: rule.reportId ? Number(rule.reportId) : null,
        tableName: rule.tableName,
        columnName: rule.columnName,
        value: rule.value
      }))
  };
}
