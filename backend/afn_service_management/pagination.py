"""Default list paging: 10 per page, and callers may ask for up to 200 with ?page_size=.

Screens that read a whole list (fetchAllPages in the frontend) ask for 200 per request, so 25,000
jobs take about 125 requests instead of 2,500. Lists with their own paging keep their own limits.
"""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 200
