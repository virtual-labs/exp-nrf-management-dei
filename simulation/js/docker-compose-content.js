// Embedded docker-compose.yml content
const DOCKER_COMPOSE_CONTENT = `services:
  mysql:
    container_name: "mysql"
    image: ghcr.io/openairinterface/mysql:8.0
    ports:
      - "3306:3306"
    expose:
      - 3306/tcp
    volumes:
      - ./database/oai_db.sql:/docker-entrypoint-initdb.d/oai_db.sql
      - ./healthscripts/mysql-healthcheck.sh:/tmp/mysql-healthcheck.sh
    environment:
      - TZ=Europe/Paris
      - MYSQL_DATABASE=oai_db
      - MYSQL_USER=test
      - MYSQL_PASSWORD=test
      - MYSQL_ROOT_PASSWORD=linux
      - MYSQL_TCP_PORT=3306
    command: --default-authentication-plugin=mysql_native_password --character-set-server=utf8 --collation-server=utf8_general_ci
    healthcheck:
      test: /bin/bash -c "mysqladmin ping -h 127.0.0.1 -u root -plinux -P 3306 2>/dev/null | grep 'mysqld is alive' || exit 1"
      interval: 3s
      timeout: 2s
      retries: 60
      start_period: 40s
    restart: always
    networks:
      public_net:
        ipv4_address: 192.168.70.131

  oai-udr:
    container_name: "oai-udr"
    image: ghcr.io/openairinterface/oai-udr:develop
    expose:
      - 80/tcp
      - 8080/tcp
    volumes:
      - ./conf/config.yaml:/openair-udr/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      mysql:
        condition: service_healthy
      oai-nrf:
        condition: service_started
    networks:
      public_net:
        ipv4_address: 192.168.70.136

  oai-udm:
    container_name: "oai-udm"
    image: ghcr.io/openairinterface/oai-udm:develop
    expose:
      - 80/tcp
      - 8080/tcp
    volumes:
      - ./conf/config.yaml:/openair-udm/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      - oai-udr
    networks:
      public_net:
        ipv4_address: 192.168.70.137

  oai-ausf:
    container_name: "oai-ausf"
    image: ghcr.io/openairinterface/oai-ausf:develop
    expose:
      - 80/tcp
      - 8080/tcp
    volumes:
      - ./conf/config.yaml:/openair-ausf/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      - oai-udm
    networks:
      public_net:
        ipv4_address: 192.168.70.138

  oai-nrf:
    container_name: "oai-nrf"
    image: ghcr.io/openairinterface/oai-nrf:develop
    expose:
      - 80/tcp
      - 8080/tcp
    volumes:
      - ./conf/config.yaml:/openair-nrf/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    networks:
      public_net:
        ipv4_address: 192.168.70.130

  oai-amf:
    container_name: "oai-amf"
    image: ghcr.io/openairinterface/oai-amf:develop
    expose:
      - 80/tcp
      - 8080/tcp
      - 38412/sctp
    volumes:
      - ./conf/config.yaml:/openair-amf/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      mysql:
        condition: service_healthy
      oai-nrf:
        condition: service_started
      oai-ausf:
        condition: service_started
    networks:
      public_net:
        ipv4_address: 192.168.70.132

  oai-smf:
    container_name: "oai-smf"
    image: ghcr.io/openairinterface/oai-smf:develop
    expose:
      - 80/tcp
      - 8080/tcp
      - 8805/udp
    volumes:
      - ./conf/config.yaml:/openair-smf/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      oai-nrf:
        condition: service_started
      oai-amf:
        condition: service_started
    networks:
      public_net:
        ipv4_address: 192.168.70.133

  oai-upf:
    container_name: "oai-upf"
    image: ghcr.io/openairinterface/oai-upf:develop
    expose:
      - 80/tcp
      - 2152/udp
      - 8805/udp
    volumes:
      - ./conf/config.yaml:/openair-upf/etc/config.yaml
    environment:
      - TZ=Europe/Paris
    depends_on:
      oai-nrf:
        condition: service_started
      oai-smf:
        condition: service_started
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
      - IPC_LOCK
    cap_drop:
      - ALL
    privileged: true
    healthcheck:
      test: /bin/bash -c "curl -s http://localhost:8080/nfinstances | grep -q oai-upf || true"
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
    networks:
      public_net:
        ipv4_address: 192.168.70.134

  oai-traffic-server:
    privileged: true
    init: true
    container_name: oai-ext-dn
    image: ghcr.io/openairinterface/trf-gen-cn5g:latest
    environment:
      - UPF_FQDN=oai-upf
      - UE_NETWORK=10.0.0.0/24
      - USE_FQDN=yes
      - UPF_IP=192.168.70.134
      - DN_IP=192.168.70.135
    depends_on:
      oai-upf:
        condition: service_healthy
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
      - NET_RAW
      - IPC_LOCK
    cap_drop:
      - ALL
    healthcheck:
      test: /bin/bash -c "ip r | grep 12.1.1 || ping -c 1 192.168.70.134 > /dev/null 2>&1 || true"
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 30s
    networks:
      public_net:
        ipv4_address: 192.168.70.135

networks:
  public_net:
    driver: bridge
    name: oaiworkshop
    ipam:
      config:
        - subnet: 192.168.70.128/26
    driver_opts:
      com.docker.network.bridge.name: "oaiworkshop"`;
