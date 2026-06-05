# Start Up
- Make sure you have the latest code: `git pull`
- Make sure `docker desktop` has started
- Navigate to `../mosavali` directory
- Run command: `docker-compose up --build -d`
- You can close cmd

# Start/Stop
- `docker-compose stop`
- `docker-compose start`

# Exporting Database
- Tables & data: `docker exec -t <container_id> pg_dumpall -U mosavali > full_db.sql`
- Only data: `docker exec -t <container_id>  pg_dump -U mosavali -a mosavali > data_only.sql`

# Applying .sql
You may have to change `.sql` to UTF-8 encoding.
- Remove volumes: `docker-compose down -v`
- Only start db: `docker-compose up -d db`
- Apply: `docker exec -i <container_id> psql -U mosavali < full_db.sql`
