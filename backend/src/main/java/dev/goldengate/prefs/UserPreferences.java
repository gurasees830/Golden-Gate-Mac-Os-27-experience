package dev.goldengate.prefs;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {
  @Id
  @Column(name = "user_id")
  private Long userId;

  @Column(name = "data", nullable = false, columnDefinition = "text")
  private String data;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Version
  private long version;

  protected UserPreferences() {}

  public UserPreferences(Long userId, String data) {
    this.userId = userId;
    update(data);
  }

  public void update(String data) {
    this.data = data;
    this.updatedAt = Instant.now();
  }

  public Long getUserId() { return userId; }
  public String getData() { return data; }
  public Instant getUpdatedAt() { return updatedAt; }
}
