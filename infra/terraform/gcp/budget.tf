# --- Step 1 (part): budget alert. Created only when billing_account_id is set ---------------------------------------

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_billing_budget" "dev" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "${var.name} monthly budget"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "GBP" # must match the billing account's currency
      units         = tostring(var.budget_amount_gbp)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    # Emails go to the billing account's admins and users.
    disable_default_iam_recipients = false
  }

  depends_on = [google_project_service.this]
}
