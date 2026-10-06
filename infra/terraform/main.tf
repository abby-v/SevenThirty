# SevenThirty hosting: one Azure Static Web App on the Free plan.
# Price snapshots ship with the site and are versioned in git, so no storage
# account is needed. Expected running cost: £0 a month on the Free plan.

terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

variable "resource_group_name" {
  type    = string
  default = "rg-seventhirty-prod"
}

variable "location" {
  description = "Resource group region."
  type        = string
  default     = "uksouth"
}

variable "swa_location" {
  description = "Static Web Apps control-plane region (UK regions are not offered; content is served globally)."
  type        = string
  default     = "westeurope"
}

variable "custom_domain" {
  description = "Optional custom domain, for example seventhirty.co.uk. Leave empty to skip."
  type        = string
  default     = ""
}

variable "tags" {
  type = map(string)
  default = {
    workload = "seventhirty"
    env      = "prod"
  }
}

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_static_web_app" "this" {
  name                = "stapp-seventhirty-prod"
  resource_group_name = azurerm_resource_group.this.name
  location            = var.swa_location
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
  description = "Store as AZURE_STATIC_WEB_APPS_API_TOKEN (GitHub) or SWA_DEPLOYMENT_TOKEN (Azure DevOps)."
  value       = azurerm_static_web_app.this.api_key
  sensitive   = true
}
