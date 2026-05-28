from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class CarMake(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()

    def __str__(self):
        return self.name


class CarModel(models.Model):
    CAR_TYPES = [
        ("Sedan", "Sedan"),
        ("SUV", "SUV"),
        ("Wagon", "Wagon"),
        ("Coupe", "Coupe"),
        ("Truck", "Truck"),
    ]

    car_make = models.ForeignKey(CarMake, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    dealer_id = models.IntegerField(default=1)
    type = models.CharField(max_length=10, choices=CAR_TYPES, default="Sedan")
    year = models.IntegerField(default=2023, validators=[MinValueValidator(2015), MaxValueValidator(2023)])

    def __str__(self):
        return self.name
