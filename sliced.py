import math

images = [(500, 300), (200, 100)]


def normalize(images):
    return [(1, h / w) for w, h in images]


def optimal_slices(images, dest_ratio=math.sqrt(2)):
    dp = [0 for _ in images]
    images = normalize(images)
