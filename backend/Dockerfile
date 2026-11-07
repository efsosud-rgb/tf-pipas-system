FROM php:8.3-cli-alpine

# Install system dependencies & PostgreSQL dev libraries
RUN apk add --no-cache \
    postgresql-client \
    postgresql-dev \
    libzip-dev \
    zip \
    unzip \
    git \
    curl \
    linux-headers

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_pgsql pdo_mysql zip pcntl

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock* ./
RUN composer install --no-scripts --no-autoloader --prefer-dist || true

COPY . .
RUN composer dump-autoload --optimize || true

EXPOSE 8000

CMD ["sh", "-c", "php artisan migrate --force --seed || true && php artisan serve --host=0.0.0.0 --port=8000"]
