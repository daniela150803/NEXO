# NexoVoz - Asistente Académico por Voz

Aplicación web HTML5 standalone que funciona completamente en el navegador.

## 🎯 Características

- 🎤 **Web Speech API**: Reconocimiento de voz en español
- 📱 **Responsive**: Diseño optimizado para móvil y desktop
- ✨ **Animaciones**: Partículas, ondas, transiciones suaves
- 🎨 **Diseño único**: Paleta naranja/rosa/cyan/teal/lima
- ♿ **Accesible**: Alto contraste, áreas táctiles grandes

## 📦 Contenido

- `index.html` (506 líneas) - Estructura de 5 pantallas
- `styles.css` (1501 líneas) - Estilos completos
- `script.js` (431 líneas) - Lógica + Web Speech API
- `README.md` - Esta documentación

## ✅ Comandos Funcionales

### 1. Crear Resumen
Genera resumen sobre "Energías Renovables":
- Idea principal
- Puntos clave  
- Conclusión

### 2. Crear Lista de Tareas
Organiza tareas de "Proyecto Final" por prioridad:
- Alta (3 tareas)
- Media (2 tareas)
- Baja (2 tareas)

### 3. Crear Mapa Conceptual  
Caso de error - muestra pantalla de error

## 🚀 Cómo Usar

### Opción 1: Abrir directamente
```bash
# Doble clic en index.html
```

### Opción 2: Servidor local (recomendado)
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js
npx serve

# Luego visita: http://localhost:8000
```

## 🌐 Compatibilidad

### Web Speech API (Voz)
- ✅ Chrome/Edge (Windows, macOS, Android)
- ✅ Safari (macOS, iOS)
- ⚠️ Firefox (soporte limitado)
- ❌ Internet Explorer (no soportado)

**Nota**: Si la voz no está disponible, usa transcripciones predefinidas.

## 📱 Pantallas

1. **Home** - Comandos disponibles
2. **Listening** - Escucha activa con ondas
3. **Results (Resumen)** - Energías renovables
4. **Results (Tareas)** - Proyecto final
5. **Error** - Manejo de errores

## 🎨 Paleta de Colores

- `#fb923c` - Naranja (principal)
- `#f43f5e` - Rosa (acento 1)
- `#22d3ee` - Cyan (acento 2)
- `#14b8a6` - Teal (acento 3)
- `#a3e635` - Lima (acento 4)
- `#fbbf24` - Ámbar (complemento)

## 🔧 Tecnologías

- **HTML5** - Estructura semántica
- **CSS3** - Animaciones, gradientes, glassmorphism
- **JavaScript ES6+** - Lógica de aplicación
- **Web Speech API** - Reconocimiento de voz
- **Font Awesome 6** - Iconos (CDN)

## 🎯 Características Técnicas

- **20 partículas** animadas en home
- **30 barras de onda** en listening
- **Efecto de tipeo** 50ms/carácter
- **Responsive** breakpoint: 1024px
- **Sin dependencias** (solo Font Awesome CDN)

## ⚙️ Personalización

### Cambiar colores
Edita `/styles.css` líneas 10-30:
```css
:root {
  --orange-400: #fb923c;
  --rose-500: #f43f5e;
  /* ... más colores */
}
```

### Añadir comandos
1. Edita `handleCommand()` en `/script.js`
2. Crea nueva pantalla en `/index.html`
3. Añade estilos en `/styles.css`

## 🔒 Permisos

Al usar el micrófono, el navegador pedirá permiso. Esto es necesario para Web Speech API.

## 📄 Licencia

Proyecto de código abierto para uso educativo.

## 💡 Soporte

- Verifica consola del navegador (F12)
- Asegura compatibilidad con Web Speech API
- Otorga permisos de micrófono

---

**Desarrollado con ❤️ para la educación accesible**
