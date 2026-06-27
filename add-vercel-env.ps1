$envFile = ".env.local"

$names = @(
  "FIREBASE_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "LOGIN_EMAIL_DOMAIN",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_APP_SECRET",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_TEMPLATE_PARAMETER_FORMAT",
  "WHATSAPP_DEFAULT_COUNTRY_CODE",
  "WHATSAPP_TEMPLATE_MEETING_REMINDER",
  "WHATSAPP_TEMPLATE_ABSENT_NOTICE",
  "WHATSAPP_TEMPLATE_ABSENCE_REVIEW",
  "WHATSAPP_MAX_BATCH_SIZE",
  "WHATSAPP_DAILY_SEND_LIMIT",
  "WHATSAPP_MEMBER_COOLDOWN_MINUTES",
  "WHATSAPP_SEND_RETRY_ATTEMPTS"
)

foreach ($name in $names) {
  $line = Select-String -Path $envFile -Pattern ("^" + [regex]::Escape($name) + "=") | Select-Object -First 1

  if (-not $line) {
    Write-Host "Missing in .env.local: $name"
    continue
  }

  $value = $line.Line.Substring($name.Length + 1).Trim()

  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  Write-Host "Adding $name"
  $value | vercel env add $name production
}
