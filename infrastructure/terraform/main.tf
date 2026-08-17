terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "project_id" { type = string }
variable "region" { type = string  default = "asia-south1" }
variable "service_name" { type = string default = "creozentic-web" }
variable "image" { type = string }

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_cloud_run_v2_service" "web" {
  name     = var.service_name
  location = var.region
  deletion_protection = false
  template {
    containers {
      image = var.image
      ports { container_port = 3000 }
      resources { limits = { cpu = "1", memory = "1Gi" } }
    }
  }
}

resource "google_cloud_run_v2_job" "worker" {
  name     = "${var.service_name}-worker"
  location = var.region
  template {
    template {
      containers { image = var.image command = ["node", "worker.js"] }
      max_retries = 2
    }
  }
}

output "web_uri" { value = google_cloud_run_v2_service.web.uri }
