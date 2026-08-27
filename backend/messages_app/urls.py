from django.urls import path, include
from rest_framework import routers
from .views import CustomerSupportCaseViewSet, MessageViewSet

router = routers.DefaultRouter()
router.register(r'support-cases', CustomerSupportCaseViewSet, basename='support-case')
router.register(r'', MessageViewSet, basename='message')

urlpatterns = [
    path('', include(router.urls)),
]
