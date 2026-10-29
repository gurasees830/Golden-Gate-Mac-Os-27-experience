package dev.goldengate.prefs;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPreferencesRepository extends JpaRepository<UserPreferences, Long> {}
