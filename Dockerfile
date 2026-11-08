FROM nginx:alpine

# Cloud Run injecte la variable d'environnement PORT (par défaut 8080)
ENV PORT=8080

# Copie du template de configuration nginx (automatiquement résolu par envsubst dans l'image officielle)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copie des fichiers statiques de l'application
COPY docs /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
