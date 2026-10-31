# Monthly budget on the loop-dev compartment. Budgets live in the tenancy root, in the home region.

resource "oci_budget_budget" "dev" {
  count    = var.budget_amount > 0 ? 1 : 0
  provider = oci.home

  compartment_id = var.tenancy_ocid
  display_name   = "${var.name}-monthly"
  description    = "LOOP DEV monthly budget"
  amount         = var.budget_amount
  reset_period   = "MONTHLY"
  target_type    = "COMPARTMENT"
  targets        = [local.compartment_id]
  freeform_tags  = var.freeform_tags
}

resource "oci_budget_alert_rule" "dev" {
  for_each = var.budget_amount > 0 && length(var.budget_alert_emails) > 0 ? toset(["50", "90", "100"]) : toset([])
  provider = oci.home

  budget_id      = oci_budget_budget.dev[0].id
  display_name   = "${var.name}-at-${each.value}pct"
  type           = "ACTUAL"
  threshold_type = "PERCENTAGE"
  threshold      = tonumber(each.value)
  recipients     = join(",", var.budget_alert_emails)
  message        = "LOOP DEV has used ${each.value}% of its monthly budget. Stop the VM if nobody is testing."
}
