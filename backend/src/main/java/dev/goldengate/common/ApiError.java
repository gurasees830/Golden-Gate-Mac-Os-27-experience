package dev.goldengate.common;

import org.springframework.http.HttpStatus;

/** An error with a user-facing message, rendered as {"status", "message"}. */
public class ApiError extends RuntimeException {
  private final HttpStatus status;

  public ApiError(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public HttpStatus status() {
    return status;
  }
}
