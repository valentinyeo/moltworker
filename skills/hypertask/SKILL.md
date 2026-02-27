---
name: hypertask
description: Manage tasks, projects, and boards on Hypertask. List tasks, create tasks, update tasks, search, manage board columns, and add comments. Use when the user asks about tasks, todos, tickets, or project management.
user-invocable: true
---

# Hypertask Task Management

Manage tasks and projects via Hypertask. Requires `HYPERTASK_BEARER_TOKEN` env var.

## MCP Client Script

The script at `/root/clawd/skills/hypertask/scripts/hypertask-mcp.js` speaks MCP protocol to the Hypertask API.

```bash
# General usage
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js <tool_name> '<json_args>'
```

## Available Tools

### Get User Context (start here)
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_get_user_context
```
Returns all boards/projects the user has access to with IDs and permissions. **Always call this first** if you don't know which project to use.

### List Tasks
```bash
# All tasks in a project
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_list_tasks '{"project_id": 15}'

# Filter by section/column
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_list_tasks '{"project_id": 15, "section": "Todo"}'

# Filter by assignee, priority
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_list_tasks '{"project_id": 15, "assigned_to": "me", "priority": "High"}'

# With pagination
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_list_tasks '{"project_id": 15, "limit": 20, "offset": 0, "sort_by": "updatedAt", "sort_order": "desc"}'
```

### Search Tasks
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_search_tasks '{"query": "login bug", "project_id": 15}'
```

### Get Task Details
```bash
# By task ID
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_get_tasks '{"task_id": [12345]}'

# By ticket number
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_get_tasks '{"ticket_number": ["HTPR-3550"]}'
```

### Create Task
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_create_task '{"project_id": 15, "title": "Fix login page", "description": "<p>The login page has a CSS issue on mobile</p>", "priority": 2, "section_id": 100}'
```
- **project_id** and **title** are required
- **description** MUST be HTML (`<p>text</p>`, `<br>`, etc.)
- **priority**: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
- **estimate**: 0=None, 1=XS, 2=S, 3=M, 4=L, 5=XL, 6=XXL, 7=XXXL

### Update Task
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_update_task '{"task_id": 12345, "priority": 1, "sectionId": 200}'
```
- Move between columns with `sectionId`
- Update title, description (HTML), priority, estimate, status

### Add Comment
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_add_comment_to_task '{"task_id": 12345, "text": "<p>Updated the fix. Ready for review.</p>"}'
```
- **text** MUST be HTML format

### Get Comments
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_get_comments_for_task '{"task_id": 12345}'
```

### List Board Columns/Sections
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_section '{"action": "list", "project_id": 15}'
```

### Move Task Between Boards
```bash
node /root/clawd/skills/hypertask/scripts/hypertask-mcp.js hypertask_move_task_between_boards '{"task_id": 12345, "target_project_id": 20}'
```

## Important Notes

- **HTML required**: Description and comment `text` fields MUST use HTML format (`<p>`, `<br>`, etc.). Plain text is rejected.
- **Always get context first**: If the user doesn't specify a project, call `hypertask_get_user_context` to show available boards and ask them to choose.
- **Section names are case-sensitive**: Use `hypertask_section` with `action=list` to get exact section names before filtering.
- **Task links**: Each task response includes a `link` field with the URL: `https://app.hypertask.ai/detail/project-{projectId}/{uniqueIndex}`
