import pymysql
import sys
try:
    conn = pymysql.connect(host='localhost', user='root', password='1234', db='agile_ai_management')
    cur = conn.cursor()
    cur.execute('SELECT email FROM users WHERE id=1')
    row = cur.fetchone()
    if row:
        print(row[0])
    else:
        print('NOT_FOUND')
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
