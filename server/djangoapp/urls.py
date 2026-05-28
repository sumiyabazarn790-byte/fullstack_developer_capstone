from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from . import views

app_name = 'djangoapp'
urlpatterns = [
    path(route='register', view=views.registration, name='register'),
    path(route='login', view=views.login_user, name='login'),
    path(route='logout', view=views.logout_request, name='logout'),
    path(route='get_dealers', view=views.get_dealerships, name='get_dealers'),
    path(route='get_dealers/<str:state>', view=views.get_dealerships, name='get_dealers_by_state'),
    path(route='fetchDealers/<str:state>', view=views.fetch_dealers_by_state, name='fetch_dealers_by_state'),
    path(route='dealer/<int:dealer_id>', view=views.get_dealer_details, name='dealer_details'),
    path(route='fetchDealer/<int:dealer_id>', view=views.fetch_dealer_by_id, name='fetch_dealer_by_id'),
    path(route='reviews/dealer/<int:dealer_id>', view=views.get_dealer_reviews, name='dealer_reviews'),
    path(route='analyze/<str:review_text>', view=views.analyze_review, name='analyze_review'),
    path(route='add_review', view=views.add_review, name='add_review'),
    path(route='get_cars', view=views.get_cars, name='get_cars'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
