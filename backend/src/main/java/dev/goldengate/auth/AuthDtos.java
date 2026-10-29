package dev.goldengate.auth;

import dev.goldengate.user.UserAccount;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
  private AuthDtos() {}

  public record RegisterRequest(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 8, max = 128) String password,
      @NotBlank @Size(max = 80) String displayName) {}

  public record LoginRequest(@NotBlank @Email String email, @NotBlank @Size(max = 128) String password) {}

  public record UserView(Long id, String email, String displayName) {
    static UserView of(UserAccount u) {
      return new UserView(u.getId(), u.getEmail(), u.getDisplayName());
    }
  }
}
