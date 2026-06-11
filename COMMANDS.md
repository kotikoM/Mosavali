# Start Up
- Open cmd
- Make sure you have the latest code: `git pull`
- Make sure `docker desktop` has started
- Navigate to `.../mosavali` directory
- Run command: `docker-compose up --build -d`
- Check all containers are green
- You can close cmd

# Start/Stop
- `docker-compose stop`
- `docker-compose start`

# Exporting Database
- We need `container_id` of postgresql db
- Open `docker desktop` and copy it
- To export tables & data run: `docker exec -t <container_id> pg_dumpall -U mosavali > full_db.sql`
- To export only data: `docker exec -t <container_id>  pg_dump -U mosavali -a mosavali > data_only.sql`

# Applying .sql
You may have to change exported `.sql` to UTF-8 encoding.
- Inside `.../mosvali` directory open cmd
- Remove volumes. **This command deletes everything**: `docker-compose down -v`
- Only start db: `docker-compose up -d db`
- Open cmd in same directory where exported `.sql` is and run: `docker exec -i <container_id> psql -U mosavali < full_db.sql`

# Manual Database
- Opens psql: `docker exec -it mosavali-db-1 psql -U mosavali -d mosavali`