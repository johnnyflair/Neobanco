output "kms_key_arn" {
  value = aws_kms_key.this.arn
}

output "waf_arn" {
  value = aws_wafv2_web_acl.this.arn
}
