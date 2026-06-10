import requests, sys, time
BASE='http://127.0.0.1:8001'
email='demo.admin@agileai-demo.com'
password='123456'

s = requests.Session()
print('LOGIN...')
r = s.post(f'{BASE}/auth/login', data={'username': email, 'password': password})
if r.status_code!=200:
    print('LOGIN FAILED', r.status_code, r.text); sys.exit(1)
token=r.json().get('access_token')
print('TOKEN OK')
s.headers.update({'Authorization':f'Bearer {token}'})

print('GET PROJECTS')
r = s.get(f'{BASE}/projects/me')
print(r.status_code, r.text[:200])
projects=r.json()
if not projects:
    print('NO PROJECTS'); sys.exit(1)
proj=projects[0]
pid=proj['id']
print('Using project', pid)

print('GET BOARDS')
r=s.get(f'{BASE}/boards/project/{pid}')
boards=r.json()
print('boards', len(boards))
board=boards[0]
bid=board['id']
print('Using board', bid)

print('GET COLUMNS')
r=s.get(f'{BASE}/boards/project/{pid}/{bid}/columns')
cols=r.json()
print('cols', len(cols))
col=cols[0]
colid=col['id']
print('Using column', colid)

print('CREATE TASK')
task_payload={'title':'Smoke test task','description':'Created by smoke test','order_index':0,'column_id':colid,'project_id':pid}
r=s.post(f'{BASE}/projects/{pid}/tasks', json=task_payload)
print('create task', r.status_code)
if r.status_code!=200:
    print(r.text); sys.exit(1)
task=r.json(); tid=task['id']
print('Task created', tid)

print('CHECKLIST LIST (should be empty)')
r=s.get(f'{BASE}/projects/{pid}/tasks/{tid}/checklist')
print(r.status_code, r.text)

print('ADD CHECKLIST ITEM')
r=s.post(f'{BASE}/projects/{pid}/tasks/{tid}/checklist', json={'title':'Item A'})
print('add', r.status_code, r.text)
item=r.json(); iid=item['id']

print('TOGGLE ITEM DONE')
r=s.put(f'{BASE}/projects/{pid}/tasks/{tid}/checklist/{iid}', json={'is_done': True})
print('toggle', r.status_code, r.text)

print('FETCH TASKS and check completed_at / checklist counts')
r=s.get(f'{BASE}/projects/{pid}/tasks')
print('tasks list', r.status_code)
for t in r.json():
    if t['id']==tid:
        print('Task entry:', t)

print('DELETE CHECKLIST ITEM')
r=s.delete(f'{BASE}/projects/{pid}/tasks/{tid}/checklist/{iid}')
print('delete', r.status_code)

print('FINAL CHECKLIST')
r=s.get(f'{BASE}/projects/{pid}/tasks/{tid}/checklist')
print(r.status_code, r.text)

print('SMOKE TEST DONE')
