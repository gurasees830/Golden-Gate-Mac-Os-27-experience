package dev.goldengate.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param allowedOrigins origins allowed to call the API with credentials (the frontend URL)
 * @param maxPreferenceBytes upper bound for a stored preferences document
 * @param loginMaxAttempts failed logins allowed per account+IP inside the lockout window
 * @param loginLockoutMinutes how long an account+IP is locked after too many failures
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(List<String> allowedOrigins, int maxPreferenceBytes, int loginMaxAttempts, int loginLockoutMinutes) {
  public AppProperties {
    if (allowedOrigins == null) allowedOrigins = List.of("http://localhost:5173");
    if (maxPreferenceBytes <= 0) maxPreferenceBytes = 256 * 1024;
    if (loginMaxAttempts <= 0) loginMaxAttempts = 5;
    if (loginLockoutMinutes <= 0) loginLockoutMinutes = 15;
  }
}
