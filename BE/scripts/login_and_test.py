import requests
import sys
BASE='http://127.0.0.1:8000'
email='demo.admin@agileai-demo.com'
password='123456'
try:
    r = requests.post(f'{BASE}/auth/login', data={'username': email, 'password': password})
    if r.status_code != 200:
        print('LOGIN_FAILED', r.status_code, r.text)
        sys.exit(1)
    token = r.json().get('access_token')
    print('ACCESS_TOKEN', token)
    headers={'Authorization': f'Bearer {token}'}
    p = requests.get(f'{BASE}/projects/me', headers=headers)
    print('PROJECTS_STATUS', p.status_code)
    print(p.text)
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
