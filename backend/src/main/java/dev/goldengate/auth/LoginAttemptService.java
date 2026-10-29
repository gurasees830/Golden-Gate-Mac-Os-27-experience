package dev.goldengate.auth;

import dev.goldengate.config.AppProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** Simple in-memory brute-force protection: N failures per account+IP locks for a while. */
@Service
public class LoginAttemptService {
  private record Attempts(int failures, Instant firstFailure) {}

  private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();
  private final AppProperties props;
  private final Clock clock;

  public LoginAttemptService(AppProperties props) {
    this(props, Clock.systemUTC());
  }

  LoginAttemptService(AppProperties props, Clock clock) {
    this.props = props;
    this.clock = clock;
  }

  private Duration window() {
    return Duration.ofMinutes(props.loginLockoutMinutes());
  }

  public boolean isLocked(String key) {
    var a = attempts.get(key);
    if (a == null) return false;
    if (a.firstFailure().plus(window()).isBefore(clock.instant())) {
      attempts.remove(key);
      return false;
    }
    return a.failures() >= props.loginMaxAttempts();
  }

  public void failed(String key) {
    attempts.compute(key, (k, a) -> a == null || a.firstFailure().plus(window()).isBefore(clock.instant())
        ? new Attempts(1, clock.instant())
        : new Attempts(a.failures() + 1, a.firstFailure()));
  }

  public void succeeded(String key) {
    attempts.remove(key);
  }
}
