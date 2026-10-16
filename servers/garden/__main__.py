from servers.common import serve
from servers.garden.server import PORT, mcp

serve(mcp, PORT)
