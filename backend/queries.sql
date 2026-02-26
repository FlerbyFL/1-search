-- ========================================
-- PostgreSQL Queries for E-Catalog System
-- ========================================

-- ========== STATISTICS ==========

-- 1. Общая статистика по товарам
SELECT 
    COUNT(*) as total_products,
    COUNT(DISTINCT shop_name) as total_shops,
    MIN(price) as min_price,
    MAX(price) as max_price,
    AVG(price)::DECIMAL(10,2) as avg_price,
    COUNT(CASE WHEN available = true THEN 1 END) as available_products,
    COUNT(CASE WHEN available = false THEN 1 END) as unavailable_products
FROM products;

-- 2. Товары по магазинам
SELECT 
    shop_name,
    COUNT(*) as product_count,
    MIN(price) as min_price,
    MAX(price) as max_price,
    AVG(price)::DECIMAL(10,2) as avg_price,
    COUNT(CASE WHEN available = true THEN 1 END) as available_count
FROM products
GROUP BY shop_name
ORDER BY product_count DESC;

-- 3. Последний статус парсинга
SELECT 
    shop_name,
    last_parsed_at,
    total_products,
    CASE 
        WHEN last_parsed_at IS NULL THEN 'Never'
        WHEN NOW() - last_parsed_at < INTERVAL '1 hour' THEN 'Recent (< 1 hour)'
        WHEN NOW() - last_parsed_at < INTERVAL '1 day' THEN 'Today'
        WHEN NOW() - last_parsed_at < INTERVAL '7 days' THEN 'This week'
        ELSE 'Outdated'
    END as status
FROM parsing_status
ORDER BY last_parsed_at DESC NULLS LAST;

-- 4. Размер таблиц в БД
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ========== PRODUCT SEARCHES ==========

-- 5. Поиск товаров (пример)
SELECT 
    product_name,
    price,
    shop_name,
    available,
    created_at
FROM products
WHERE product_name ILIKE '%смартфон%'
ORDER BY price ASC;

-- 6. Самые популярные товары (по количеству в разных магазинах)
SELECT 
    product_name,
    COUNT(DISTINCT shop_name) as shops_count,
    COUNT(*) as total_listings,
    MIN(price) as cheapest,
    MAX(price) as most_expensive,
    AVG(price)::DECIMAL(10,2) as avg_price
FROM products
GROUP BY product_name
HAVING COUNT(*) >= 2
ORDER BY total_listings DESC
LIMIT 20;

-- 7. Самые дешевые товары по категориям
SELECT DISTINCT ON (product_name)
    product_name,
    shop_name,
    price,
    product_url
FROM products
WHERE product_name ILIKE '%ноутбук%'
ORDER BY product_name, price ASC;

-- 8. Товары с самой большой разницей в цене
SELECT 
    product_name,
    MAX(price) - MIN(price) as price_difference,
    MAX(price) as max_price,
    MIN(price) as min_price,
    COUNT(DISTINCT shop_name) as shops_with_this_product
FROM products
GROUP BY product_name
HAVING COUNT(DISTINCT shop_name) >= 2
ORDER BY price_difference DESC
LIMIT 20;

-- ========== DATA QUALITY ==========

-- 9. Товары с отсутствующими изображениями
SELECT 
    COUNT(*) as products_without_images,
    COUNT(DISTINCT shop_name) as shops_affected
FROM products
WHERE image_url IS NULL OR image_url = '';

-- 10. Товары с отсутствующими URL
SELECT 
    shop_name,
    COUNT(*) as products_without_urls
FROM products
WHERE product_url IS NULL OR product_url = ''
GROUP BY shop_name;

-- 11. Товары с неверными ценами (< 1 рубля или > 100 млн)
SELECT 
    COUNT(*) as suspicious_prices,
    shop_name,
    MIN(price) as min_price,
    MAX(price) as max_price
FROM products
WHERE price < 1 OR price > 100000000
GROUP BY shop_name;

-- 12. Дублирующиеся товары в одном магазине
SELECT 
    shop_name,
    product_name,
    COUNT(*) as count,
    COUNT(DISTINCT price) as different_prices
FROM products
GROUP BY shop_name, product_name
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ========== PRICE ANALYSIS ==========

-- 13. История изменения цен для конкретного товара
SELECT 
    products.product_name,
    products.shop_name,
    price_history.old_price,
    price_history.new_price,
    (price_history.new_price - price_history.old_price) as price_change,
    ((price_history.new_price - price_history.old_price) / price_history.old_price * 100)::DECIMAL(5,2) as change_percent,
    price_history.changed_at
FROM price_history
JOIN products ON price_history.product_id = products.id
WHERE products.product_name ILIKE '%смартфон%'
ORDER BY price_history.changed_at DESC;

-- 14. Среднее изменение цен по магазинам
SELECT 
    products.shop_name,
    COUNT(price_history.id) as price_changes,
    AVG(price_history.new_price - price_history.old_price)::DECIMAL(10,2) as avg_price_change,
    MIN(price_history.changed_at) as first_change,
    MAX(price_history.changed_at) as last_change
FROM price_history
JOIN products ON price_history.product_id = products.id
GROUP BY products.shop_name
ORDER BY price_changes DESC;

-- ========== DATA CLEANUP ==========

-- 15. Удалить товары старше определенной даты
-- DELETE FROM products WHERE created_at < '2024-01-01';

-- 16. Удалить товары без названия
-- DELETE FROM products WHERE product_name IS NULL OR TRIM(product_name) = '';

-- 17. Удалить дублирующиеся товары (оставляя только самый свежий)
-- DELETE FROM products p1
-- WHERE EXISTS (
--     SELECT 1 FROM products p2
--     WHERE p2.shop_name = p1.shop_name
--     AND p2.product_name = p1.product_name
--     AND p2.id > p1.id
-- );

-- ========== PERFORMANCE OPTIMIZATION ==========

-- 18. Анализ индексов
SELECT 
    idx.schemaname,
    idx.tablename,
    idx.indexname,
    pg_size_pretty(pg_relation_size(idx.indexrelid)) as index_size,
    CASE 
        WHEN idx.indexdef ILIKE '%UNIQUE%' THEN 'UNIQUE'
        ELSE 'NON-UNIQUE'
    END as index_type
FROM pg_indexes idx
WHERE idx.schemaname = 'public'
ORDER BY pg_relation_size(idx.indexrelid) DESC;

-- 19. Неиспользуемые индексы
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scan_count
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 20. Медленные запросы (требует pg_stat_statements)
SELECT 
    query,
    calls,
    mean_exec_time::DECIMAL(10,2) as avg_time_ms,
    max_exec_time::DECIMAL(10,2) as max_time_ms,
    rows
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- ========== MAINTENANCE ==========

-- 21. Обновить статистику таблиц (для оптимизации планов запросов)
-- ANALYZE;

-- 22. Полная оптимизация БД
-- REINDEX DATABASE e_catalog;
-- VACUUM ANALYZE;

-- 23. Проверить целостность данных
-- REINDEX TABLE products;

-- ========== EXPORT ==========

-- 24. Экспортировать в JSON для бэкапа
SELECT json_agg(
    json_build_object(
        'id', id,
        'name', product_name,
        'price', price,
        'shop', shop_name,
        'url', product_url,
        'image', image_url,
        'available', available,
        'created_at', created_at,
        'updated_at', updated_at
    ) ORDER BY id
) as products_backup
FROM products;

-- 25. Экспортировать CSV
-- COPY (
--     SELECT product_name, price, shop_name, available, created_at
--     FROM products
--     ORDER BY created_at DESC
-- ) TO '/tmp/products.csv' WITH CSV HEADER;

-- ========== SCHEDULING ==========

-- 26. Создать событие для автоматической очистки старых данных
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-old-products', '0 2 * * *', 
--     'DELETE FROM products WHERE created_at < NOW() - INTERVAL ''30 days''');

-- 27. Создать событие для регулярной оптимизации
-- SELECT cron.schedule('optimize-db', '0 3 * * 0', 'ANALYZE;');

-- ========== ALERTS ==========

-- 28. Товары без парсинга за последние 24 часа
SELECT 
    shop_name,
    CASE WHEN last_parsed_at IS NULL THEN 'Never parsed'
         ELSE (NOW() - last_parsed_at)::TEXT
    END as time_since_last_parse
FROM parsing_status
WHERE last_parsed_at IS NULL 
   OR NOW() - last_parsed_at > INTERVAL '24 hours'
ORDER BY last_parsed_at NULLS FIRST;

-- 29. Проверить здоровье системы
SELECT 
    'Database Size' as metric,
    pg_size_pretty(pg_database_size('e_catalog'))::TEXT as value
UNION ALL
SELECT 
    'Total Products',
    COUNT(*)::TEXT
FROM products
UNION ALL
SELECT 
    'Available Products',
    COUNT(*)::TEXT
FROM products
WHERE available = true
UNION ALL
SELECT 
    'Last Parse',
    MAX(last_parsed_at)::TEXT
FROM parsing_status;
