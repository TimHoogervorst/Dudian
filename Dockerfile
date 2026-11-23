FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
ENV DATA_DIR=/data PORT=3000
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000 14551
CMD ["node","--experimental-strip-types","src/server.ts"]
