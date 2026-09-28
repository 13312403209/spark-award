"""Serve either independent edition with Python's standard library."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse, webbrowser

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--edition',choices=['100k','50k'],default='50k')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-open',action='store_true')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    directory=root/('dist' if args.edition=='100k' else 'editions/50k/threejs')
    if not (directory/'index.html').is_file(): parser.error('Edition source is missing')
    handler=partial(SimpleHTTPRequestHandler,directory=str(directory))
    with ThreadingHTTPServer(('127.0.0.1',args.port),handler) as server:
        url=f'http://127.0.0.1:{server.server_port}/'
        print(f'{args.edition}: {url}',flush=True)
        if not args.no_open: webbrowser.open(url)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
if __name__=='__main__': main()
