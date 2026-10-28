import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase-config.js';
import { escapeHtml } from '../ui.js';

let client = null;
let liveChannel = null;
let activeTeamId = localStorage.getItem('maindeck-active-team') || '';
let notice = '';

function getClient() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) return null;
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

function message(text, kind = 'info') {
  const el = document.getElementById('team-message');
  if (el) {
    el.className = `team-message team-message-${kind}`;
    el.textContent = text;
    el.hidden = !text;
  }
}

function errorText(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export async function render(container) {
  const supabase = getClient();
  if (!supabase) {
    container.innerHTML = `
      <div class="page-container team-page">
        <section class="card team-setup-card">
          <div class="team-eyebrow">SHARED TEAM SPACE</div>
          <h2>Connect your team task board</h2>
          <p>This Main Deck copy needs a shared database before your team can see the same tasks.</p>
          <ol>
            <li>Create a Supabase project.</li>
            <li>Run <code>supabase/team_tasks.sql</code> in its SQL Editor.</li>
            <li>Copy the Project URL and publishable key into <code>js/supabase-config.js</code>.</li>
            <li>Reload this page, then create a team and share its invite code.</li>
          </ol>
          <p class="team-note">The shared board is separate from your private Main Deck notes, projects, and local tasks.</p>
        </section>
      </div>`;
    return;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    container.innerHTML = `<div class="page-container"><div class="card">${escapeHtml(error.message)}</div></div>`;
    return;
  }
  if (!session) {
    renderAuth(container);
    return;
  }
  await renderTeamArea(container, session.user);
}

function renderAuth(container) {
  container.innerHTML = `
    <div class="page-container team-page">
      <section class="card team-auth-card">
        <div class="team-eyebrow">MAIN DECK | TEAM SPACE</div>
        <h2>Sign in to your shared task board</h2>
        <p>Each teammate signs in with their own work email. Your team tasks then stay in one shared online workspace.</p>
        <div id="team-message" class="team-message" hidden></div>
        <form id="team-auth-form" class="team-form">
          <label class="form-group"><span class="form-label">Your name</span><input name="displayName" autocomplete="name" placeholder="e.g. Asha" /></label>
          <label class="form-group"><span class="form-label">Work email</span><input name="email" type="email" autocomplete="email" placeholder="you@company.com" required /></label>
          <label class="form-group"><span class="form-label">Password</span><input name="password" type="password" autocomplete="current-password" minlength="8" required /></label>
          <div class="team-auth-actions"><button class="btn btn-primary" type="submit" name="mode" value="signin">Sign in</button><button class="btn btn-secondary" type="submit" name="mode" value="signup">Create account</button></div>
        </form>
        <p class="team-note">If you create an account, check your email if confirmation is enabled for the Supabase project.</p>
      </section>
    </div>`;

  const form = container.querySelector('#team-auth-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const data = new FormData(form);
    const mode = submitter?.value || 'signin';
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    const displayName = String(data.get('displayName')).trim();
    submitter.disabled = true;
    message(mode === 'signup' ? 'Creating your account...' : 'Signing in...');
    const supabase = getClient();
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
      : await supabase.auth.signInWithPassword({ email, password });
    submitter.disabled = false;
    if (result.error) return message(errorText(result.error), 'error');
    if (mode === 'signup' && !result.data.session) {
      message('Account created. Confirm your email, then return here and sign in.', 'success');
      return;
    }
    await render(container);
  });
}

async function renderTeamArea(container, user) {
  const supabase = getClient();
  const { data: memberships, error: memberError } = await supabase
    .from('team_members').select('team_id, role, display_name').eq('user_id', user.id);
  if (memberError) {
    container.innerHTML = `<div class="page-container"><div class="card">Could not load your team membership: ${escapeHtml(errorText(memberError))}</div></div>`;
    return;
  }

  const ids = (memberships || []).map((m) => m.team_id);
  let teams = [];
  if (ids.length) {
    const result = await supabase.from('teams').select('id, name, join_code').in('id', ids).order('name');
    if (result.error) {
      container.innerHTML = `<div class="page-container"><div class="card">Could not load teams: ${escapeHtml(errorText(result.error))}</div></div>`;
      return;
    }
    teams = result.data || [];
  }
  if (!teams.some((team) => team.id === activeTeamId)) activeTeamId = teams[0]?.id || '';

  if (!teams.length) {
    container.innerHTML = `
      <div class="page-container team-page">
        <section class="card team-auth-card">
          <div class="team-eyebrow">ONE SHARED BOARD FOR YOUR TEAM</div><h2>Create or join a team</h2>
          <p>Create a workspace for you and your team leader, or enter the invite code shared by an existing member.</p>
          <div id="team-message" class="team-message" hidden></div>
          <form id="create-team-form" class="team-form">
            <label class="form-group"><span class="form-label">Team name</span><input name="teamName" placeholder="e.g. CRM Operations" maxlength="80" required /></label>
            <button class="btn btn-primary" type="submit">Create team</button>
          </form>
          <div class="team-divider"><span>OR JOIN AN EXISTING TEAM</span></div>
          <form id="join-team-form" class="team-form team-join-form">
            <label class="form-group"><span class="form-label">Invite code</span><input name="joinCode" placeholder="Paste the team code" maxlength="20" required /></label>
            <button class="btn btn-secondary" type="submit">Join team</button>
          </form>
          <button class="btn btn-ghost team-signout" id="team-signout">Sign out</button>
        </section>
      </div>`;
    wireTeamSetup(container, user);
    return;
  }

  const activeTeam = teams.find((team) => team.id === activeTeamId);
  const myMembership = memberships.find((member) => member.team_id === activeTeamId);
  const { data: members, error: listError } = await supabase
    .from('team_members').select('user_id, display_name, role').eq('team_id', activeTeamId).order('display_name');
  if (listError) {
    container.innerHTML = `<div class="page-container"><div class="card">Could not load teammates: ${escapeHtml(errorText(listError))}</div></div>`;
    return;
  }
  const { data: tasks, error: taskError } = await supabase
    .from('team_tasks').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false });
  if (taskError) {
    container.innerHTML = `<div class="page-container"><div class="card">Could not load tasks: ${escapeHtml(errorText(taskError))}</div></div>`;
    return;
  }
  const memberMap = new Map((members || []).map((member) => [member.user_id, member]));
  const taskRows = tasks || [];
  const doneCount = taskRows.filter((task) => task.status === 'done').length;

  container.innerHTML = `
    <div class="page-container team-page">
      <section class="team-board-header">
        <div><div class="team-eyebrow">TEAM WORKSPACE</div><h2>${escapeHtml(activeTeam.name)}</h2><p>${members.length} ${members.length === 1 ? 'member' : 'members'} | shared live task board</p></div>
        <div class="team-header-actions">
          ${teams.length > 1 ? `<select id="team-switch" aria-label="Choose team">${teams.map((team) => `<option value="${escapeHtml(team.id)}" ${team.id === activeTeamId ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}</select>` : ''}
          <button id="team-signout" class="btn btn-secondary btn-sm">Sign out</button>
        </div>
      </section>
      <section class="team-stats">
        <div class="team-stat"><strong>${taskRows.length}</strong><span>Total tasks</span></div><div class="team-stat"><strong>${taskRows.filter((task) => task.status !== 'done').length}</strong><span>Open</span></div><div class="team-stat"><strong>${doneCount}</strong><span>Completed</span></div>
      </section>
      <section class="team-invite-card">
        <div><strong>Invite your team leader or teammate</strong><span>Share this code so they can join the same board.</span></div><code>${escapeHtml(activeTeam.join_code)}</code>
      </section>
      <div id="team-message" class="team-message" hidden></div>
      <section class="card team-create-card">
        <div><div class="team-eyebrow">NEW ASSIGNMENT</div><h3>Assign a task</h3><p>Everyone in this workspace can view tasks and assign work to any teammate.</p></div>
        <form id="team-task-form" class="team-task-form">
          <label class="form-group"><span class="form-label">Task</span><input name="title" maxlength="160" placeholder="What needs to be done?" required /></label>
          <label class="form-group"><span class="form-label">Assign to</span><select name="assigneeId"><option value="">Unassigned</option>${members.map((member) => `<option value="${escapeHtml(member.user_id)}">${escapeHtml(member.display_name)}${member.user_id === user.id ? ' (you)' : ''}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">Due date</span><input name="dueDate" type="date" /></label>
          <button class="btn btn-primary" type="submit">Add task</button>
          <label class="form-group team-description"><span class="form-label">Details (optional)</span><textarea name="description" rows="2" maxlength="1000" placeholder="Add notes or useful context"></textarea></label>
        </form>
      </section>
      <section class="team-task-list-header"><div><div class="team-eyebrow">SHARED TASKS</div><h3>All team tasks</h3></div><select id="team-task-filter" aria-label="Filter tasks"><option value="all">All tasks</option><option value="open">Open tasks</option><option value="done">Completed</option><option value="mine">Assigned to me</option></select></section>
      <section id="team-task-list" class="team-task-list">
        ${taskRows.length ? taskRows.map((task) => taskCard(task, memberMap, user.id)).join('') : '<div class="card team-empty"><strong>No team tasks yet</strong><span>Add the first assignment above. Everyone on the team will see it.</span></div>'}
      </section>
      <p class="team-footnote">Signed in as ${escapeHtml(user.email || '')}${myMembership?.role === 'manager' ? ' | Team creator' : ''}. Personal Main Deck data remains on this device.</p>
    </div>`;

  if (notice) { message(notice, 'success'); notice = ''; }
  wireBoard(container, activeTeam, members || [], user);
  startLiveUpdates(activeTeamId, container, user);
}

function taskCard(task, memberMap, currentUserId) {
  const assignee = task.assignee_id ? memberMap.get(task.assignee_id)?.display_name || 'Former member' : 'Unassigned';
  const statusLabels = { todo: 'To do', in_progress: 'In progress', done: 'Completed' };
  const due = task.due_date ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date';
  const overdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'done';
  return `<article class="team-task-card" data-status="${escapeHtml(task.status)}" data-assignee="${escapeHtml(task.assignee_id || '')}">
    <div class="team-task-main"><div class="team-task-title-row"><span class="team-status-dot team-status-${escapeHtml(task.status)}"></span><h4>${escapeHtml(task.title)}</h4></div>
    ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
    <div class="team-task-meta"><span class="team-assignee">Assigned to <strong>${escapeHtml(assignee)}</strong>${task.assignee_id === currentUserId ? ' | you' : ''}</span><span class="${overdue ? 'team-overdue' : ''}">${overdue ? 'Overdue | ' : ''}${escapeHtml(due)}</span></div></div>
    <div class="team-task-actions"><select class="team-status-select" data-id="${escapeHtml(task.id)}" aria-label="Task status"><option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To do</option><option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In progress</option><option value="done" ${task.status === 'done' ? 'selected' : ''}>Completed</option></select><button class="btn btn-ghost btn-sm team-task-delete" data-id="${escapeHtml(task.id)}" title="Delete task">Delete</button></div>
  </article>`;
}

function wireTeamSetup(container, user) {
  const supabase = getClient();
  container.querySelector('#team-signout').addEventListener('click', async () => { await supabase.auth.signOut(); await render(container); });
  container.querySelector('#create-team-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const teamName = new FormData(event.currentTarget).get('teamName').trim();
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Team member';
    const { data, error } = await supabase.rpc('create_team', { p_team_name: teamName, p_display_name: displayName });
    button.disabled = false;
    if (error) return message(errorText(error), 'error');
    activeTeamId = data;
    localStorage.setItem('maindeck-active-team', activeTeamId);
    notice = 'Team created. Share the invite code with your team leader or teammate.';
    await render(container);
  });
  container.querySelector('#join-team-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const joinCode = new FormData(event.currentTarget).get('joinCode').trim().toUpperCase();
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Team member';
    const { data, error } = await supabase.rpc('join_team_by_code', { p_join_code: joinCode, p_display_name: displayName });
    button.disabled = false;
    if (error) return message(errorText(error), 'error');
    activeTeamId = data;
    localStorage.setItem('maindeck-active-team', activeTeamId);
    await render(container);
  });
}

function wireBoard(container, team, members, user) {
  const supabase = getClient();
  const taskForm = container.querySelector('#team-task-form');
  taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const values = new FormData(taskForm);
    const title = String(values.get('title')).trim();
    if (!title) return;
    button.disabled = true;
    const { error } = await supabase.from('team_tasks').insert({
      team_id: team.id,
      title,
      description: String(values.get('description')).trim() || null,
      assignee_id: String(values.get('assigneeId')) || null,
      due_date: String(values.get('dueDate')) || null,
      status: 'todo',
      created_by: user.id
    });
    button.disabled = false;
    if (error) return message(errorText(error), 'error');
    taskForm.reset();
    message('Task added. Your team can see the assignment now.', 'success');
    await renderTeamArea(container, user);
  });

  container.querySelector('#team-task-filter').addEventListener('change', (event) => {
    const filter = event.target.value;
    container.querySelectorAll('.team-task-card').forEach((card) => {
      const show = filter === 'all' || (filter === 'open' && card.dataset.status !== 'done') || (filter === 'done' && card.dataset.status === 'done') || (filter === 'mine' && card.dataset.assignee === user.id);
      card.hidden = !show;
    });
  });
  container.querySelectorAll('.team-status-select').forEach((select) => select.addEventListener('change', async () => {
    const { error } = await supabase.from('team_tasks').update({ status: select.value }).eq('id', select.dataset.id).eq('team_id', team.id);
    if (error) message(errorText(error), 'error');
  }));
  container.querySelectorAll('.team-task-delete').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Delete this shared task for everyone on the team?')) return;
    const { error } = await supabase.from('team_tasks').delete().eq('id', button.dataset.id).eq('team_id', team.id);
    if (error) return message(errorText(error), 'error');
    await renderTeamArea(container, user);
  }));
  const switcher = container.querySelector('#team-switch');
  if (switcher) switcher.addEventListener('change', async () => {
    activeTeamId = switcher.value;
    localStorage.setItem('maindeck-active-team', activeTeamId);
    await renderTeamArea(container, user);
  });
  container.querySelector('#team-signout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    if (liveChannel) supabase.removeChannel(liveChannel);
    await render(container);
  });
}

function startLiveUpdates(teamId, container, user) {
  const supabase = getClient();
  if (liveChannel) supabase.removeChannel(liveChannel);
  liveChannel = supabase.channel(`team-tasks-${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${teamId}` }, () => {
      if (activeTeamId === teamId && document.querySelector('#team-task-list')) renderTeamArea(container, user);
    })
    .subscribe();
}
