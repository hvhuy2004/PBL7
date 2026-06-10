import requests, sys, time, io
BASE='http://127.0.0.1:8001'
email='demo.admin@agileai-demo.com'
password='123456'

s = requests.Session()
print('LOGIN...')
r = s.post(f'{BASE}/auth/login', data={'username': email, 'password': password})
if r.status_code!=200:
    print('LOGIN FAILED', r.status_code, r.text); sys.exit(1)
token=r.json().get('access_token')
s.headers.update({'Authorization':f'Bearer {token}'})

# pick project
r = s.get(f'{BASE}/projects/me')
proj = r.json()[0]
pid = proj['id']
print('Project', pid)

# get boards/columns
r = s.get(f'{BASE}/boards/project/{pid}')
board = r.json()[0]
bid = board['id']
r = s.get(f'{BASE}/boards/project/{pid}/{bid}/columns')
colid = r.json()[0]['id']

# create task
print('Create task')
task_payload={'title':'Extended smoke task','description':'for ext tests','order_index':0,'column_id':colid,'project_id':pid}
r=s.post(f'{BASE}/projects/{pid}/tasks', json=task_payload)
if r.status_code!=200:
    print('create task failed', r.status_code, r.text); sys.exit(1)
task=r.json(); tid=task['id']
print('Task', tid)

# add comment
print('Add comment')
r = s.post(f'{BASE}/comments/', json={'task_id': tid, 'content': 'Hello from smoke test'})
print('comment', r.status_code, r.text)

# attachments: upload small text file
print('Upload attachment')
file_content = io.BytesIO(b'Test attachment')
files = {'file': ('test.txt', file_content, 'text/plain')}
r = s.post(f'{BASE}/attachments/task/{tid}', files=files)
print('upload', r.status_code, r.text)
attach_id = None
if r.status_code==200:
    attach_id = r.json().get('id')

# tags: create tag then assign
print('Create tag')
r = s.post(f'{BASE}/tags/project/{pid}', json={'name':'smoke-tag','color_hex':'#ff0000'})
print('create tag', r.status_code, r.text)
tag_id = r.json().get('id') if r.status_code==200 else None
if tag_id:
    r = s.post(f'{BASE}/tags/task/{tid}/add/{tag_id}')
    print('assign tag', r.status_code, r.text)

# notifications
print('Notifications')
r = s.get(f'{BASE}/notifications/')
print('list', r.status_code, r.text[:200])

# AI probe: call project AI summary if exists
print('AI probe: workload/context')
r = s.get(f'{BASE}/projects/{pid}/ai/context')
print('AI context', r.status_code, r.text[:300])

print('Extended smoke complete')
