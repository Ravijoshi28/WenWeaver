FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --legacy-peer-deps

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING_INTERVAL=1000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD ["sh", "-c", "while true; do sleep 3600; done"]