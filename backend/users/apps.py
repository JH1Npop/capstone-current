from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = 'users'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        # Connect ChangeLog signals when the app loads
        import users.signals  # noqa: F401
