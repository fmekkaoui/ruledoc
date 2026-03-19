// @policy(access.admin, critical): Only admins can delete resources
export function deleteResource() {}

// @policy(access.viewer): Viewers have read-only access
export function viewResource() {}

// @rule(billing.plans): This should NOT be found with --tag policy
export function checkPlan() {}
