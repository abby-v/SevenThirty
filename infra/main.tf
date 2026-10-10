# Azure Static Web App for SevenThirty (Free tier is enough: static files, global CDN, free TLS).
#   terraform init && terraform apply
#   terraform output -raw deployment_token   → GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN
#                                               (or Azure DevOps variable SWA_DEPLOYMENT_TOKEN)

terraform {
  required_version = ">= 1.5"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}

provider "azurerm" {
  features {}
}

variable "name" {
  type    = string
  default = "seventhirty"
}

# Static Web Apps run in a few metadata regions; content is served from the global edge regardless.
variable "location" {
  type    = string
  default = "westeurope"
}

variable "custom_domain" {
  type        = string
  default     = ""
  description = "Optional, e.g. calc.example.co.uk. Create a CNAME to the default hostname first."
}

variable "tags" {
  type    = map(string)
  default = { workload = "seventhirty", managed_by = "terraform" }
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${var.name}"
  location = var.location
  tags     = var.tags
}

resource "azurerm_static_web_app" "this" {
  name                = "swa-${var.name}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = var.tags
}

resource "azurerm_static_web_app_custom_domain" "this" {
  count             = var.custom_domain == "" ? 0 : 1
  static_web_app_id = azurerm_static_web_app.this.id
  domain_name       = var.custom_domain
  validation_type   = "cname-delegation"
}

output "default_hostname" {
  value = azurerm_static_web_app.this.default_host_name
}

output "deployment_token" {
  value     = azurerm_static_web_app.this.api_key
  sensitive = true
}
