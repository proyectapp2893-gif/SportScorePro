# Checklist manual de Sports Score Pro

Usar este checklist despues de aplicar migraciones en un entorno de prueba o staging. Antes de aplicar migraciones, los flujos que llaman RPCs de Fase 2 y Fase 3 pueden fallar en runtime aunque el build compile.

## Preparacion

- Confirmar variables locales y de Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_BUNKER_USER`, `MASTER_BUNKER_PASSWORD` o `MASTER_BUNKER_KEY`.
- Confirmar que existe al menos un cliente activo en `clients` con `slug` unico.
- Confirmar que las migraciones estan aplicadas en Supabase antes de probar mesa, eventos, cierre de partidos y cronometros.
- Abrir dos navegadores o perfiles distintos para probar Realtime: uno como juez/admin y otro como aficionado/TV.

## Autenticacion y tenant

- Entrar a `/master` con credenciales master.
- Crear o seleccionar cliente y verificar que el slug abra `/{slug}/admin`.
- Entrar a `/{slug}/admin` con credencial del cliente.
- Intentar entrar a otro `/{otroSlug}/admin` sin sesion de ese cliente.
- Cerrar sesion y confirmar que las rutas admin vuelven a pedir login.

## Administrador

- Crear torneo nuevo con nombre, logo y configuracion base.
- Crear categorias para futbol, baloncesto, voleibol y softbol/beisbol.
- Registrar colegios/delegaciones con escudo.
- Registrar equipos por categoria.
- Registrar deportistas con numero de camiseta.
- Generar fase de grupos o fixture automatico.
- Confirmar que fechas, jornadas, equipos local/visitante y descansos son correctos.
- Editar datos basicos y verificar que no se duplican colegios, equipos o jugadores.

## Mesa de futbol

- Abrir `/{slug}/admin/mesa?cat={categoriaFutbol}`.
- Iniciar partido programado.
- Registrar alineacion inicial local y visitante.
- Registrar gol local y gol visitante.
- Registrar tarjeta amarilla, doble amarilla y roja.
- Registrar sustitucion.
- Ajustar marcador manualmente si aplica.
- Cerrar partido normal.
- Probar definicion por penales si el partido termina empatado y corresponde.
- Probar W/O local y visitante.
- Verificar que no se puedan registrar eventos despues del cierre.

## Mesa de baloncesto

- Abrir mesa de una categoria de baloncesto.
- Iniciar partido.
- Iniciar, pausar y reiniciar cronometro countdown.
- Cambiar de cuarto.
- Registrar puntos de 1, 2 y 3.
- Registrar falta o sancion si esta disponible.
- Probar timeout.
- Cerrar partido.
- Verificar que el marcador y periodo se actualizan en resultados y TV.

## Mesa de voleibol y deportes de sets

- Abrir mesa de voleibol.
- Registrar puntos local y visitante.
- Cambiar set.
- Cerrar set y verificar `home_sets` / `away_sets`.
- Cerrar partido.
- Repetir con padel o tenis si existen como categorias.
- Confirmar que posiciones usan sets como resultado de tabla.

## Mesa de softbol/beisbol

- Abrir mesa de softbol o beisbol.
- Iniciar partido.
- Iniciar, pausar y reiniciar cronometro progresivo.
- Cambiar inning/periodo.
- Registrar carreras local y visitante.
- Registrar eventos disponibles de lineup o juego.
- Cerrar partido.
- Confirmar que posiciones ordenan por puntos y porcentaje de victoria cuando aplica.

## Resultados publicos

- Abrir `/{slug}/resultados`.
- Seleccionar torneo y categoria.
- Ver fixture ordenado por estado, jornada y hora.
- Ver tabla de posiciones.
- Confirmar puntos:
  - Futbol: victoria 3, empate 1, derrota 0.
  - Baloncesto: ganador 2, perdedor 1.
  - Voleibol/raqueta: ganador 2, perdedor 1.
  - Beisbol/softbol: victoria 3, empate 1 si se permite.
- Confirmar desempates:
  - Fair play si esta habilitado.
  - Futbol: diferencia y goles a favor.
  - Basket/voley/raqueta: ratio y puntos a favor.
  - Beisbol/softbol: porcentaje de victoria y carreras a favor.
- Abrir detalle de un partido finalizado y revisar eventos.

## TV y Realtime

- Abrir `/tv` o `/tv/{id}` en una segunda ventana.
- Mantener resultados publicos abiertos en otra ventana.
- Desde mesa, iniciar partido y registrar eventos.
- Confirmar que marcador, periodo, cronometro y eventos cambian sin refrescar.
- Pausar internet o cerrar una pestana y volver a abrir para validar recuperacion visual.
- Confirmar que no aparecen eventos duplicados al navegar entre partidos.

## Seguridad y consistencia

- Repetir pruebas con dos clientes/slugs distintos.
- Confirmar que un admin de un cliente no puede ver ni editar torneos de otro.
- Verificar en Supabase que los eventos tienen `match_id`, `team_id`, `player_id` cuando corresponde.
- Confirmar que el marcador final coincide con eventos registrados.
- Confirmar que un partido `FINISHED` no mantiene cronometro activo.
- Confirmar que un partido `FINISHED` no aparece como pendiente en mesa.

## Criterios de salida

- Build de produccion pasa.
- Tests unitarios pasan.
- Todas las mesas probadas cierran partidos correctamente.
- Resultados publicos y TV reflejan datos en Realtime.
- No hay datos cruzados entre clientes.
- No hay diferencias entre marcador, eventos y tabla de posiciones.
