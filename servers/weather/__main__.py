from servers.common import serve
from servers.weather.server import PORT, mcp

serve(mcp, PORT)
