"""URL configuration for afn_service_management project."""

import re

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.contrib.staticfiles.views import serve as staticfiles_serve
from django.urls import include, path, re_path

from .views import frontend_app, frontend_public_file

admin.site.site_header = 'AFN Service Management Admin'
admin.site.site_title = 'AFN Admin Portal'
admin.site.index_title = 'Administration'

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('favicon.svg', frontend_public_file, {'filename': 'favicon.svg'}, name='frontend-favicon'),
    path('favicon.ico', frontend_public_file, {'filename': 'afn-serve-icon-192-v2.png'}, name='frontend-favicon-ico'),
    path('manifest.webmanifest', frontend_public_file, {'filename': 'manifest.webmanifest'}, name='frontend-manifest'),
    path('sw.js', frontend_public_file, {'filename': 'sw.js'}, name='frontend-service-worker'),
    path('offline.html', frontend_public_file, {'filename': 'offline.html'}, name='frontend-offline-page'),
    path('afn-serve-icon-192-v2.png', frontend_public_file, {'filename': 'afn-serve-icon-192-v2.png'}, name='frontend-afn-serve-icon-192-v2'),
    path('afn-serve-icon-512-v2.png', frontend_public_file, {'filename': 'afn-serve-icon-512-v2.png'}, name='frontend-afn-serve-icon-512-v2'),
    path('pwa-icon-192.png', frontend_public_file, {'filename': 'pwa-icon-192.png'}, name='frontend-pwa-icon-192'),
    path('pwa-icon-512.png', frontend_public_file, {'filename': 'pwa-icon-512.png'}, name='frontend-pwa-icon-512'),
    path('hero-bg.png', frontend_public_file, {'filename': 'hero-bg.png'}, name='frontend-hero-bg'),
    path('login-bg.jpg', frontend_public_file, {'filename': 'login-bg.jpg'}, name='frontend-login-bg-jpg'),
    path('login-bg.png', frontend_public_file, {'filename': 'login-bg.png'}, name='frontend-login-bg-png'),
    path('logo.png', frontend_public_file, {'filename': 'logo.png'}, name='frontend-logo'),
    path('logo1.png', frontend_public_file, {'filename': 'logo1.png'}, name='frontend-logo-1'),
    path('register-bg.png', frontend_public_file, {'filename': 'register-bg.png'}, name='frontend-register-bg-png'),
    path('user-icon.png', frontend_public_file, {'filename': 'user-icon.png'}, name='frontend-user-icon'),
]

# With Channels/ASGI, static files are not auto-served like classic WSGI runserver.
# django.conf.urls.static.static() returns [] when DEBUG=False, and staticfiles.views.serve
# returns 404 unless insecure=True — so wire explicitly for local/Docker with DEBUG off.
if getattr(settings, 'SERVE_STATIC_URLPATTERNS', settings.DEBUG):
    if settings.DEBUG:
        urlpatterns += staticfiles_urlpatterns()
    else:
        _prefix = settings.STATIC_URL
        if not _prefix:
            raise ValueError('STATIC_URL must be set when SERVE_STATIC_URLPATTERNS is enabled.')

        def staticfiles_dev_serve(request, path):
            return staticfiles_serve(request, path, insecure=True)

        urlpatterns += [
            re_path(
                r'^%s(?P<path>.*)$' % re.escape(_prefix.lstrip('/')),
                staticfiles_dev_serve,
            ),
        ]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# React handles the non-API application routes after the initial HTML load.
urlpatterns += [
    re_path(r'^(?!api/|django-admin/|static/|media/).*$', frontend_app, name='frontend-app'),
]
