package dev.goldengate.common;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ApiError.class)
  ResponseEntity<Map<String, Object>> api(ApiError e) {
    return body(e.status(), e.getMessage());
  }

  @ExceptionHandler(BadCredentialsException.class)
  ResponseEntity<Map<String, Object>> badCredentials() {
    return body(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException e) {
    var first = e.getBindingResult().getFieldErrors().stream().findFirst();
    return body(HttpStatus.BAD_REQUEST, first.map(f -> f.getField() + " " + f.getDefaultMessage()).orElse("Invalid request."));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<Map<String, Object>> unreadable() {
    return body(HttpStatus.BAD_REQUEST, "Malformed JSON body.");
  }

  private static ResponseEntity<Map<String, Object>> body(HttpStatus s, String message) {
    return ResponseEntity.status(s).body(Map.of("status", s.value(), "message", message));
  }
}
