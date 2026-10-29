package dev.goldengate.user;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_account")
public class UserAccount {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true, length = 254)
  private String email;

  @Column(name = "display_name", nullable = false, length = 80)
  private String displayName;

  @Column(name = "password_hash", nullable = false, length = 100)
  private String passwordHash;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  protected UserAccount() {}

  public UserAccount(String email, String displayName, String passwordHash) {
    this.email = email;
    this.displayName = displayName;
    this.passwordHash = passwordHash;
  }

  public Long getId() { return id; }
  public String getEmail() { return email; }
  public String getDisplayName() { return displayName; }
  public String getPasswordHash() { return passwordHash; }
  public Instant getCreatedAt() { return createdAt; }
}
