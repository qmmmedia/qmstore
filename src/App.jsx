import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from './lib/supabase'
import { Bell, ChevronRight, CreditCard, FileText, Gift, LayoutDashboard, LogOut, Menu, Moon, Package, Plus, Search, Settings, ShoppingCart, Sun, UserRound, Wallet, X } from 'lucide-react'

const demoServices = [
  { id: 'social-growth', name: 'Tăng trưởng mạng xã hội', category: 'Social media', description: 'Xây cộng đồng, nội dung và quảng cáo hợp lệ cho kênh của khách hàng.', price: 900000, unit: ' / gói', icon: '◈' },
  { id: 'website', name: 'Website các loại', category: 'Phát triển web', description: 'Landing page, website doanh nghiệp và cửa hàng trực tuyến.', price: 2500000, unit: ' / dự án', icon: '⌘' },
  { id: 'ads', name: 'Chạy quảng cáo', category: 'Digital ads', description: 'Thiết lập, tối ưu và báo cáo theo chính sách nền tảng.', price: 500000, unit: ' / chiến dịch', icon: '✦' },
  { id: 'content-video', name: 'Nội dung & video', category: 'Content', description: 'Kế hoạch nội dung, thiết kế và video ngắn cho thương hiệu.', price: 750000, unit: ' / gói', icon: '◌' },
  { id: 'automation', name: 'Tự động hóa kênh sở hữu', category: 'Automation', description: 'Chatbot và quy trình tự động cho kênh do khách hàng sở hữu.', price: 1200000, unit: ' / gói', icon: '✦' },
  { id: 'strategy', name: 'Tư vấn chiến lược số', category: 'Strategy', description: 'Đánh giá kênh và xây lộ trình tăng trưởng bền vững.', price: 600000, unit: ' / buổi', icon: '◌' }
]
const money = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + 'đ'
const nav = [
  ['home', LayoutDashboard, 'Tổng quan'], ['services', Package, 'Dịch vụ'], ['order', ShoppingCart, 'Đặt dịch vụ'], ['orders', FileText, 'Đơn hàng'], ['wallet', Wallet, 'Ví của tôi'], ['profile', UserRound, 'Hồ sơ']
]

export default function App() {
  const [theme, setTheme] = useState('dark')
  const [screen, setScreen] = useState('home')
  const [authMode, setAuthMode] = useState('login')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [services, setServices] = useState(demoServices)
  const [orders, setOrders] = useState([])
  const [notice, setNotice] = useState('')
  const [drawer, setDrawer] = useState(false)

  const notify = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3200) }
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session) loadAccount(); else { setProfile(null); setOrders([]) } }, [session])
  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    if (!supabase) return
    const { data } = await supabase.from('services').select('*, service_items(*)').eq('is_active', true).order('sort_order')
    if (data) setServices(data.map(s => ({ ...s, price: Number(s.price), unit: s.unit || ' / gói', icon: '✦', items: s.service_items || [] })))
  }
  async function loadAccount() {
    const [{ data: profileRow }, { data: orderRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('orders').select('*, services(name)').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(8)
    ])
    setProfile(profileRow || { full_name: session.user.email?.split('@')[0], wallet_balance: 0, role: 'user' })
    setOrders(orderRows || [])
  }
  const isAdmin = profile?.role === 'admin'
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Khách hàng'

  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} notify={notify} />
  return <div className="app-shell" data-theme={theme}>
    <Sidebar screen={screen} setScreen={setScreen} isAdmin={isAdmin} drawer={drawer} close={() => setDrawer(false)} onLogout={() => supabase.auth.signOut()} />
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setDrawer(true)}><Menu /></button><div className="search"><Search size={18}/><input placeholder="Tìm dịch vụ, đơn hàng..." /></div><div className="top-actions"><button className="square" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Đổi giao diện">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="square" onClick={() => notify('Bạn có 2 thông báo mới')} aria-label="Thông báo"><Bell size={18}/></button><div className="user-pill"><span>{displayName.slice(0, 1).toUpperCase()}</span><b>{displayName}</b></div></div></header>
      {screen === 'home' && <Home setScreen={setScreen} services={services} balance={profile?.wallet_balance || 0} orders={orders} />}
      {screen === 'services' && <Services services={services} setScreen={setScreen} />}
      {screen === 'order' && <Order services={services} session={session} balance={profile?.wallet_balance || 0} refresh={loadAccount} notify={notify} />}
      {screen === 'orders' && <Orders orders={orders} />}
      {screen === 'wallet' && <WalletView balance={profile?.wallet_balance || 0} notify={notify} refresh={loadAccount} />}
      {screen === 'profile' && <Profile profile={profile} notify={notify} />}
      {screen === 'admin' && isAdmin && <Admin services={services} refresh={loadServices} notify={notify} />}
    </main>
    {notice && <div className="toast">{notice}</div>}
  </div>
}

function AuthScreen({ mode, setMode, notify }) {
  const [loading, setLoading] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!hasSupabase) return notify('Hãy thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env.local trước.')
    setLoading(true)
    const email = form.get('email'), password = form.get('password')
    const result = mode === 'login' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { full_name: form.get('fullName') } } })
    setLoading(false)
    if (result.error) notify(result.error.message)
    else if (mode === 'register') notify('Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản.')
  }
  const login = mode === 'login'
  return <div className="auth-page"><section className="auth-art"><div className="brand"><BrandMark/> <b>QM STORE</b></div><div className="auth-copy"><span className="eyebrow">DIGITAL SERVICES</span><h1>{login ? 'Chào mừng trở lại.' : 'Nền tảng dịch vụ số cho doanh nghiệp.'}</h1><p>Đặt dịch vụ, quản lý đơn hàng và thanh toán minh bạch trong một không gian thống nhất.</p><div className="trust"><span>⚡ Nhanh chóng</span><span>◈ An toàn</span><span>✦ Dễ quản lý</span></div></div><div className="orb orb-one"/><div className="orb orb-two"/></section><section className="auth-form-area"><form className="auth-card" onSubmit={submit}><div className="mobile-brand"><BrandMark/> <b>QM STORE</b></div><h2>{login ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h2><p>{login ? 'Đăng nhập để tiếp tục quản lý dịch vụ của bạn.' : 'Bắt đầu quản lý các dịch vụ của bạn.'}</p>{!login && <Field label="Họ và tên" name="fullName" placeholder="Nhập họ và tên của bạn" required/>}<Field label="Email" name="email" type="email" placeholder="you@example.com" required/><Field label="Mật khẩu" name="password" type="password" placeholder="••••••••" required/>{!login && <Field label="Nhập lại mật khẩu" type="password" placeholder="••••••••" required/>}{login ? <div className="remember"><label><input type="checkbox"/> Ghi nhớ đăng nhập</label><button type="button">Quên mật khẩu?</button></div> : <label className="terms"><input type="checkbox" required/> Tôi đồng ý với Điều khoản sử dụng</label>}<button className="primary-btn" disabled={loading}>{loading ? 'Đang xử lý...' : login ? 'Đăng nhập' : 'Tạo tài khoản'} <ChevronRight size={17}/></button><div className="switch-auth">{login ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}<button type="button" onClick={() => setMode(login ? 'register' : 'login')}>{login ? 'Đăng ký ngay' : 'Đăng nhập'}</button></div></form></section></div>
}
function Field({ label, ...props }) { return <label className="field"><span>{label}</span><input {...props}/></label> }
function BrandMark() { return <span className="brand-mark">QM</span> }

function Sidebar({ screen, setScreen, isAdmin, drawer, close, onLogout }) {
  const navigate = key => { setScreen(key); close() }
  return <><aside className={'sidebar ' + (drawer ? 'open' : '')}><div className="sidebar-top"><div className="brand"><BrandMark/> <b>QM STORE</b></div><button className="close-menu" onClick={close}><X/></button></div><div className="nav-label">KHÁM PHÁ</div><nav>{nav.map(([key, Icon, label]) => <button key={key} className={screen === key ? 'active' : ''} onClick={() => navigate(key)}><Icon size={18}/>{label}</button>)}</nav>{isAdmin && <><div className="nav-label">QUẢN TRỊ</div><nav><button className={screen === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}><Settings size={18}/>Quản lý dịch vụ</button></nav></>}<div className="support"><b>Đồng hành cùng bạn</b><p>Cần hỗ trợ về dịch vụ? Gửi ticket cho QM STORE.</p><button>Liên hệ hỗ trợ</button></div><button className="logout" onClick={onLogout}><LogOut size={17}/>Đăng xuất</button></aside>{drawer && <button className="backdrop" aria-label="Đóng menu" onClick={close}/>}</>
}

function Home({ setScreen, services, balance, orders }) {
  const processing = orders.filter(order => order.status === 'processing').length
  const completed = orders.filter(order => order.status === 'completed').length
  return <section className="page"><h1>Chào bạn 👋</h1><p className="sub">Mọi dịch vụ số của bạn, ở một nơi rõ ràng và dễ theo dõi.</p><div className="hero-grid"><article className="hero"><span className="eyebrow">QM STORE / DIGITAL SERVICES</span><h2>Đặt dịch vụ nhanh, theo dõi minh bạch.</h2><p>Chọn gói phù hợp, áp ưu đãi và quản lý đơn hàng trong một luồng đơn giản.</p><button onClick={() => setScreen('order')}>Đặt dịch vụ nhanh <ChevronRight size={16}/></button><div className="hero-bag">QM</div></article><article className="balance-card"><span>Số dư khả dụng</span><strong>{money(balance)}</strong><div><button onClick={() => setScreen('wallet')}><Plus size={16}/> Nạp tiền</button><button className="soft" onClick={() => setScreen('orders')}>Lịch sử</button></div></article></div><SectionTitle title="Tổng quan tháng này"/><div className="metrics"><Metric label="Đơn đã đặt" value={orders.length} hint="Chưa có dữ liệu"/><Metric label="Đang xử lý" value={processing} hint="Chưa có dữ liệu"/><Metric label="Đã hoàn thành" value={completed} hint="Chưa có dữ liệu"/><Metric label="Ưu đãi khả dụng" value="0" hint="Chưa có dữ liệu"/></div><SectionTitle title="Dịch vụ nổi bật" action="Xem tất cả" onClick={() => setScreen('services')}/><div className="service-grid">{services.slice(0, 3).map(s => <ServiceCard key={s.id} service={s} onOrder={() => setScreen('order')}/>)}</div></section>
}
function SectionTitle({ title, action, onClick }) { return <div className="section-title"><h2>{title}</h2>{action && <button onClick={onClick}>{action} <ChevronRight size={15}/></button>}</div> }
function Metric({ label, value, hint }) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small>↗ {hint}</small></article> }
function Services({ services, setScreen }) {
  const [selectedService, setSelectedService] = useState(null)
  if (selectedService) return <section className="page"><button className="back-category" onClick={() => setSelectedService(null)}>← Tất cả dịch vụ</button><h1>{selectedService.name}</h1><p className="sub">Chọn danh mục phù hợp để tiếp tục.</p><ServiceCategoryBrowser service={selectedService} close={() => setSelectedService(null)} onOrder={() => { setSelectedService(null); setScreen('order') }}/></section>
  return <section className="page"><h1>Dịch vụ QM STORE</h1><p className="sub">Chọn một dịch vụ để xem danh mục con.</p>{services.length ? <div className="parent-service-list">{services.map(service => <button className="parent-service-row" key={service.id} onClick={() => setSelectedService(service)}><span className="service-icon">{service.icon || '✦'}</span><span><b>{service.name}</b><small>{service.description}</small></span><ChevronRight size={20}/></button>)}</div> : <div className="panel empty-services"><Package size={26}/><h2>Chưa có dịch vụ nào</h2><p>Admin có thể thêm dịch vụ mới trong khu vực Quản lý dịch vụ.</p></div>}</section>
}
function ServiceCard({ service, onOrder, onBrowse }) { return <article className="service-card"><div className="service-icon">{service.icon || '✦'}</div><span className="available">ĐANG BÁN</span><h3>{service.name}</h3><p>{service.description}</p>{service.items?.length > 0 && <span className="category-count">{service.items.filter(item => !item.parent_id).length} danh mục</span>}<b>{money(service.price)}<small>{service.unit}</small></b>{onBrowse && <button className="browse-btn" onClick={onBrowse}>Xem danh mục <ChevronRight size={15}/></button>}<button onClick={onOrder}>Đặt dịch vụ <ChevronRight size={15}/></button></article> }
function ServiceCategoryBrowser({ service, close, onOrder }) {
  const [openIds, setOpenIds] = useState([])
  const items = service.items || []
  const toggle = id => setOpenIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  return <section className="panel category-browser"><div className="editor-heading"><div><span className="eyebrow">DANH MỤC DỊCH VỤ</span><h2>{service.name}</h2><p>Chọn từng mục để mở danh mục con theo chiều dọc.</p></div><button className="square" type="button" onClick={close}><X size={18}/></button></div>{items.length ? <VerticalCategoryTree items={items} parentId={null} depth={0} openIds={openIds} toggle={toggle} onOrder={onOrder}/> : <p className="empty-note">Chưa có danh mục con. Admin có thể thêm trong Quản lý dịch vụ.</p>}</section>
}
function VerticalCategoryTree({ items, parentId, depth, openIds, toggle, onOrder }) {
  const children = items.filter(item => (item.parent_id || null) === parentId).sort((a, b) => a.sort_order - b.sort_order)
  return <div className={depth ? 'vertical-children' : 'vertical-categories'}>{children.map(item => { const hasChildren = items.some(child => child.parent_id === item.id); const isOpen = openIds.includes(item.id); return <div className="vertical-branch" key={item.id}><button className={'vertical-category-row ' + (isOpen ? 'open' : '')} style={{ paddingLeft: `${16 + depth * 26}px` }} onClick={() => hasChildren ? toggle(item.id) : onOrder()}><span className="vertical-marker">{hasChildren ? (isOpen ? '−' : '+') : '•'}</span><span><b>{item.title}</b>{item.description && <small>{item.description}</small>}</span>{hasChildren ? <ChevronRight className={isOpen ? 'rotate' : ''} size={18}/> : <span className="choose-label">Chọn</span>}</button>{hasChildren && isOpen && <VerticalCategoryTree items={items} parentId={item.id} depth={depth + 1} openIds={openIds} toggle={toggle} onOrder={onOrder}/>}</div> })}</div>
}

function Order({ services, session, balance, refresh, notify }) { const [serviceId, setServiceId] = useState(services[0]?.id); const [itemPath, setItemPath] = useState([]); const [quantity, setQuantity] = useState(1); const [coupon, setCoupon] = useState(''); const selected = useMemo(() => services.find(s => s.id === serviceId) || services[0], [services, serviceId]); if (!selected) return <section className="page"><h1>Tạo đơn dịch vụ</h1><div className="panel empty-services"><Package size={26}/><h2>Chưa có dịch vụ để đặt</h2><p>Vui lòng thêm dịch vụ mới trong khu vực Quản lý dịch vụ trước.</p></div></section>; const items = selected.items || []; const levels = serviceItemLevels(items, itemPath); const lastId = itemPath.at(-1); const selectedItem = items.find(item => item.id === lastId); const hasChild = selectedItem && items.some(item => item.parent_id === selectedItem.id); const packageItem = selectedItem && !hasChild ? selectedItem : null; const unitPrice = packageItem ? Number(packageItem.price) : Number(selected.price); const discount = coupon.toUpperCase() === 'QM10' ? Math.min(50000, Math.round(unitPrice * quantity * .1)) : 0; const total = unitPrice * quantity - discount
  function chooseService(nextId) { setServiceId(nextId); setItemPath([]) }
  function chooseItem(level, id) { setItemPath(current => [...current.slice(0, level), id]) }
  async function place(event) { event.preventDefault(); if (items.length && !packageItem) return notify('Hãy chọn đầy đủ mục con và gói dịch vụ.'); if (!supabase) return notify('Chế độ demo: thêm Supabase vào .env.local để tạo đơn thật.'); const { error } = await supabase.rpc('create_order', { p_service_id: selected.id, p_service_item_id: packageItem?.id || null, p_quantity: quantity, p_note: new FormData(event.currentTarget).get('note'), p_coupon_code: coupon || null }); if (error) return notify(error.message); await refresh(); notify('Đơn hàng đã được tạo thành công.'); }
  return <section className="page"><h1>Tạo đơn dịch vụ</h1><p className="sub">Chọn dịch vụ, sau đó chọn các mục con để hệ thống hiển thị đúng giá gói.</p><div className="order-layout"><form className="panel order-form" onSubmit={place}><h2><ShoppingCart size={21}/> Thông tin đơn hàng</h2><label className="field"><span>Dịch vụ</span><select value={serviceId} onChange={e => chooseService(e.target.value)}>{services.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>{levels.map((level, index) => <label className="field" key={level.parentId || 'root'}><span>{index === 0 ? 'Mục con' : `Mục con cấp ${index + 1}`}</span><select value={itemPath[index] || ''} onChange={e => chooseItem(index, e.target.value)} required><option value="">Chọn mục...</option>{level.children.map(item => <option value={item.id} key={item.id}>{item.title}{Number(item.price) > 0 ? ` — ${money(item.price)}${item.unit || ''}` : ''}</option>)}</select></label>)}<div className="two-fields"><label className="field"><span>Giá áp dụng</span><input value={packageItem ? `${money(packageItem.price)}${packageItem.unit || ''}` : items.length ? 'Chọn gói để xem giá' : `${money(selected.price)}${selected.unit || ''}`} disabled/></label><label className="field"><span>Số lượng</span><input type="number" min="1" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}/></label></div><label className="field"><span>Link / ghi chú yêu cầu</span><textarea name="note" placeholder="Nhập link hoặc mô tả chi tiết yêu cầu" required/></label><label className="field"><span>Mã giảm giá</span><div className="coupon"><input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Ví dụ: QM10"/><button type="button" onClick={() => coupon.toUpperCase() === 'QM10' ? notify('Đã áp dụng giảm giá 10%') : notify('Nhập QM10 để dùng mã demo')}>Áp dụng</button></div></label><button className="primary-btn">Xác nhận đặt đơn <ChevronRight size={17}/></button></form><aside className="panel summary"><h2>Chi tiết thanh toán</h2><div className="summary-service"><span className="service-icon">{selected.icon || '✦'}</span><div><b>{packageItem?.title || selected.name}</b><small>{packageItem ? `${selected.name} × ${quantity}` : `Chọn gói dịch vụ × ${quantity}`}</small></div></div><Line label="Tạm tính" value={money(unitPrice * quantity)}/><Line label="Giảm giá" value={discount ? '-' + money(discount) : '0đ'} green={discount > 0}/><Line label="Tổng thanh toán" value={money(total)} total/></aside></div></section> }
function serviceItemLevels(items, path) { const levels = []; let parentId = null; for (let index = 0; ; index += 1) { const children = items.filter(item => (item.parent_id || null) === parentId).sort((a, b) => a.sort_order - b.sort_order); if (!children.length) break; levels.push({ parentId, children }); const picked = path[index]; if (!picked || !children.some(item => item.id === picked)) break; parentId = picked } return levels }
function Line({ label, value, total, green }) { return <div className={'line ' + (total ? 'total' : '')}><span>{label}</span><b className={green ? 'green' : ''}>{value}</b></div> }
function Orders({ orders }) { return <section className="page"><h1>Đơn hàng</h1><p className="sub">Theo dõi trạng thái và lịch sử các dịch vụ bạn đã đặt.</p><div className="table-panel"><table><thead><tr><th>Mã đơn</th><th>Dịch vụ</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{orders.length ? orders.map(o => <tr key={o.id}><td>#{String(o.id).slice(0, 10).toUpperCase()}</td><td>{o.services?.name || 'Dịch vụ QM STORE'}</td><td>{money(o.total_amount)}</td><td><span className={'status ' + o.status}>{o.status === 'completed' ? 'Hoàn thành' : o.status === 'processing' ? 'Đang xử lý' : 'Chờ xử lý'}</span></td><td>{new Date(o.created_at).toLocaleDateString('vi-VN')}</td></tr>) : <tr><td colSpan="5" className="empty-cell">Chưa có đơn hàng nào.</td></tr>}</tbody></table></div></section> }
function WalletView({ balance, notify, refresh }) { const [requests, setRequests] = useState([]); const [showForm, setShowForm] = useState(false); const [loading, setLoading] = useState(false); async function loadRequests() { if (!supabase) return; const { data } = await supabase.from('wallet_topup_requests').select('*').order('created_at', { ascending: false }).limit(8); if (data) setRequests(data) } useEffect(() => { loadRequests() }, []); async function submit(event) { event.preventDefault(); if (!supabase) return notify('Hãy kết nối Supabase trước.'); const form = new FormData(event.currentTarget); const amount = Number(form.get('amount')); if (!amount || amount < 10000) return notify('Số tiền nạp tối thiểu là 10.000đ.'); setLoading(true); const { error } = await supabase.from('wallet_topup_requests').insert({ user_id: (await supabase.auth.getUser()).data.user?.id, amount, payment_reference: String(form.get('reference')).trim(), note: String(form.get('note')).trim() || null }); setLoading(false); if (error) return notify(error.message); event.currentTarget.reset(); setShowForm(false); await loadRequests(); await refresh(); notify('Đã gửi yêu cầu nạp tiền. Admin sẽ kiểm tra và duyệt.'); } return <section className="page"><h1>Ví của tôi</h1><p className="sub">Quản lý số dư và gửi yêu cầu nạp tiền để quản trị viên xác nhận.</p><div className="wallet-show"><span>QM WALLET</span><strong>{money(balance)}</strong><p>Số dư khả dụng</p><button onClick={() => setShowForm(value => !value)}>Nạp tiền <Plus size={16}/></button></div>{showForm && <form className="panel profile-form" onSubmit={submit}><h2><CreditCard size={20}/> Gửi yêu cầu nạp tiền</h2><Field label="Số tiền (VNĐ)" name="amount" type="number" min="10000" placeholder="Ví dụ: 100000" required/><Field label="Mã giao dịch / nội dung chuyển khoản" name="reference" placeholder="Ví dụ: QMSTORE 123456" required/><label className="field"><span>Ghi chú</span><textarea name="note" placeholder="Thông tin bổ sung nếu cần"/></label><button className="primary-btn" disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi yêu cầu nạp tiền'} <ChevronRight size={17}/></button></form>}<div className="table-panel"><table><thead><tr><th>Yêu cầu nạp</th><th>Mã giao dịch</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead><tbody>{requests.length ? requests.map(request => <tr key={request.id}><td>{money(request.amount)}</td><td>{request.payment_reference}</td><td><span className={'status ' + (request.status === 'approved' ? 'completed' : request.status === 'rejected' ? 'failed' : 'pending')}>{request.status === 'approved' ? 'Đã duyệt' : request.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}</span></td><td>{new Date(request.created_at).toLocaleDateString('vi-VN')}</td></tr>) : <tr><td colSpan="4" className="empty-cell">Chưa có yêu cầu nạp tiền nào.</td></tr>}</tbody></table></div><div className="panel info-card"><Gift/><div><b>Ưu đãi QM10</b><p>Giảm 10%, tối đa 50.000đ cho đơn từ 100.000đ.</p></div></div></section> }
function Profile({ profile, notify }) { const [name, setName] = useState(profile?.full_name || ''); async function save(e) { e.preventDefault(); if (!supabase) return notify('Chế độ demo: thêm Supabase để lưu hồ sơ.'); const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', profile.id); notify(error ? error.message : 'Đã lưu thông tin hồ sơ.'); } return <section className="page"><h1>Hồ sơ cá nhân</h1><p className="sub">Cập nhật thông tin và bảo mật tài khoản của bạn.</p><form className="panel profile-form" onSubmit={save}><h2><UserRound size={20}/> Thông tin cơ bản</h2><Field label="Họ và tên" value={name} onChange={e => setName(e.target.value)} required/><Field label="Email" value={profile?.email || ''} disabled/><button className="primary-btn">Lưu thay đổi</button></form></section> }
function Admin({ services, refresh, notify }) {
  const [tab, setTab] = useState('services')
  const [orders, setOrders] = useState([])
  const [topups, setTopups] = useState([])
  const [catalog, setCatalog] = useState(services)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [selectedServiceId, setSelectedServiceId] = useState(null)
  const [itemDraft, setItemDraft] = useState({ title: '', description: '', price: '', unit: '/ gói' })
  const [itemParentId, setItemParentId] = useState('')

  async function loadOrders() {
    const { data, error } = await supabase.from('orders').select('*, profiles(full_name,email), services(name)').order('created_at', { ascending: false })
    if (error) return notify(error.message)
    setOrders(data || [])
  }
  async function loadTopups() {
    const { data, error } = await supabase.from('wallet_topup_requests').select('*, profiles(full_name,email)').order('created_at', { ascending: false })
    if (!error) setTopups(data || [])
  }
  async function loadCatalog() {
    const { data, error } = await supabase.from('services').select('*, service_items(*)').order('sort_order')
    if (error) return notify(error.message)
    setCatalog(data?.map(service => ({ ...service, price: Number(service.price), items: service.service_items || [] })) || [])
  }
  useEffect(() => { loadOrders(); loadCatalog(); loadTopups() }, [])

  async function createService(event) {
    event.preventDefault()
    const { data: createdService, error } = await supabase.from('services').insert({
      name: draft.name.trim(), category: 'Dịch vụ', description: draft.description.trim(),
      price: 0, unit: '/ gói', sort_order: catalog.length + 1
    }).select().single()
    if (error) return notify(error.message)
    setDraft({ name: '', description: '' })
    await Promise.all([refresh(), loadCatalog()])
    setSelectedServiceId(createdService.id)
    setItemParentId('')
    notify('Đã thêm dịch vụ mẹ. Bây giờ thêm danh mục con.')
  }
  async function updatePrice(service, price) {
    const { error } = await supabase.from('services').update({ price: Number(price) }).eq('id', service.id)
    if (error) return notify(error.message)
    await Promise.all([refresh(), loadCatalog()])
    notify('Đã cập nhật giá dịch vụ.')
  }
  async function toggleService(service) {
    const { error } = await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id)
    if (error) return notify(error.message)
    await Promise.all([refresh(), loadCatalog()])
    notify(service.is_active ? 'Đã tạm ẩn dịch vụ.' : 'Đã mở bán dịch vụ.')
  }
  async function deleteService(service) {
    if (!window.confirm(`Xóa dịch vụ “${service.name}”? Thao tác này không thể hoàn tác.`)) return
    const { error } = await supabase.from('services').delete().eq('id', service.id)
    if (error) return notify('Không thể xóa dịch vụ đã có đơn hàng. Hãy dùng nút Ẩn để giữ lịch sử.')
    await Promise.all([refresh(), loadCatalog()])
    notify('Đã xóa dịch vụ.')
  }
  async function addServiceItem(event) {
    event.preventDefault()
    const service = catalog.find(entry => entry.id === selectedServiceId)
    if (!service) return
    const { error } = await supabase.from('service_items').insert({
      service_id: service.id, title: itemDraft.title.trim(), description: itemDraft.description.trim() || null,
      price: Number(itemDraft.price || 0), unit: itemDraft.unit.trim() || '/ gói',
      parent_id: itemParentId || null,
      sort_order: service.items.filter(item => (item.parent_id || '') === itemParentId).length + 1
    })
    if (error) return notify(error.message)
    setItemDraft({ title: '', description: '', price: '', unit: '/ gói' })
    await Promise.all([refresh(), loadCatalog()])
    notify('Đã thêm hạng mục nhỏ.')
  }
  async function deleteServiceItem(item) {
    if (!window.confirm(`Xóa hạng mục “${item.title}”?`)) return
    const { error } = await supabase.from('service_items').delete().eq('id', item.id)
    if (error) return notify(error.message)
    await Promise.all([refresh(), loadCatalog()])
    notify('Đã xóa hạng mục nhỏ.')
  }
  async function changeStatus(order, status) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (error) return notify(error.message)
    await loadOrders()
    notify('Đã cập nhật trạng thái đơn hàng.')
  }
  async function reviewTopup(request, status) {
    if (!window.confirm(`${status === 'approved' ? 'Duyệt' : 'Từ chối'} yêu cầu nạp ${money(request.amount)}?`)) return
    const { error } = await supabase.rpc('review_wallet_topup_request', { p_request_id: request.id, p_status: status })
    if (error) return notify(error.message)
    await loadTopups()
    notify(status === 'approved' ? 'Đã cộng tiền vào ví khách hàng.' : 'Đã từ chối yêu cầu nạp tiền.')
  }

  return <section className="page">
    <h1>Quản trị QM STORE</h1><p className="sub">Quản lý danh mục dịch vụ và theo dõi đơn hàng của khách.</p>
    <div className="admin-tabs"><button className={tab === 'services' ? 'active' : ''} onClick={() => setTab('services')}>Dịch vụ</button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Đơn hàng <span>{orders.length}</span></button><button className={tab === 'topups' ? 'active' : ''} onClick={() => setTab('topups')}>Nạp tiền <span>{topups.filter(request => request.status === 'pending').length}</span></button></div>
    {tab === 'services' ? <>
      <form className="panel admin-form" onSubmit={createService}>
        <h2><Plus size={20}/> Thêm dịch vụ</h2>
        <Field label="Tên dịch vụ" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required/>
        <Field label="Mô tả" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} required/>
        <button className="primary-btn">Thêm dịch vụ <ChevronRight size={17}/></button>
      </form>
      <div className="table-panel"><table><thead><tr><th>Dịch vụ</th><th>Danh mục</th><th>Giá từ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{catalog.map(s => <AdminServiceRow key={s.id} service={s} updatePrice={updatePrice} toggleService={toggleService} deleteService={deleteService} onSelectService={id => { setSelectedServiceId(id); setItemParentId('') }}/>)}</tbody></table></div>
      {selectedServiceId && <ServiceItemsEditor service={catalog.find(service => service.id === selectedServiceId)} itemDraft={itemDraft} setItemDraft={setItemDraft} parentId={itemParentId} setParentId={setItemParentId} addItem={addServiceItem} deleteItem={deleteServiceItem} close={() => { setSelectedServiceId(null); setItemParentId('') }}/>} 
    </> : tab === 'orders' ? <div className="table-panel"><table><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Dịch vụ</th><th>Tổng tiền</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody>{orders.length ? orders.map(o => <tr key={o.id}><td>#{String(o.id).slice(0, 8).toUpperCase()}</td><td><b>{o.profiles?.full_name || 'Khách hàng'}</b><small className="table-sub">{o.profiles?.email}</small></td><td>{o.services?.name || 'Dịch vụ QM STORE'}</td><td>{money(o.total_amount)}</td><td><span className={'status ' + o.status}>{statusLabel(o.status)}</span></td><td><select className="status-select" value={o.status} onChange={e => changeStatus(o, e.target.value)}><option value="pending">Chờ xử lý</option><option value="processing">Đang xử lý</option><option value="completed">Hoàn thành</option><option value="failed">Thất bại</option><option value="refunded">Đã hoàn tiền</option></select></td></tr>) : <tr><td colSpan="6" className="empty-cell">Chưa có đơn hàng nào.</td></tr>}</tbody></table></div> : <div className="table-panel"><table><thead><tr><th>Khách hàng</th><th>Số tiền</th><th>Mã giao dịch</th><th>Thời gian</th><th>Xử lý</th></tr></thead><tbody>{topups.length ? topups.map(request => <tr key={request.id}><td><b>{request.profiles?.full_name || 'Khách hàng'}</b><small className="table-sub">{request.profiles?.email}</small></td><td>{money(request.amount)}</td><td>{request.payment_reference}</td><td>{new Date(request.created_at).toLocaleString('vi-VN')}</td><td>{request.status === 'pending' ? <div className="row-actions"><button className="small-btn" onClick={() => reviewTopup(request, 'approved')}>Duyệt</button><button className="danger-btn" onClick={() => reviewTopup(request, 'rejected')}>Từ chối</button></div> : <span className={'status ' + (request.status === 'approved' ? 'completed' : 'failed')}>{request.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}</span>}</td></tr>) : <tr><td colSpan="5" className="empty-cell">Chưa có yêu cầu nạp tiền nào.</td></tr>}</tbody></table></div>}
  </section>
}
function AdminServiceRow({ service, updatePrice, toggleService, deleteService, onSelectService }) {
  const [price, setPrice] = useState(service.price)
  return <tr><td><button className="service-tree-link" onClick={() => onSelectService(service.id)}><b>{service.name}</b><small className="table-sub">{service.description}</small></button></td><td>{service.category}</td><td><input className="price-input" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)}/></td><td><span className={'status ' + (service.is_active ? 'completed' : 'failed')}>{service.is_active ? 'Đang bán' : 'Đang ẩn'}</span></td><td className="row-actions"><button className="small-btn" onClick={() => updatePrice(service, price)}>Lưu giá</button><button className="ghost-btn" onClick={() => onSelectService(service.id)}>Mở danh mục con</button><button className="ghost-btn" onClick={() => toggleService(service)}>{service.is_active ? 'Ẩn' : 'Mở bán'}</button><button className="danger-btn" onClick={() => deleteService(service)}>Xóa</button></td></tr>
}
function ServiceItemsEditor({ service, itemDraft, setItemDraft, parentId, setParentId, addItem, deleteItem, close }) {
  if (!service) return null
  const options = flattenServiceItems(service.items)
  return <section className="panel service-items-editor"><div className="editor-heading"><div><h2>Danh mục & gói dịch vụ</h2><p>{service.name} → danh mục con → gói có giá để khách đặt.</p></div><button className="square" type="button" onClick={close}><X size={18}/></button></div><form onSubmit={addItem}><div className="two-fields"><label className="field"><span>Thuộc danh mục</span><select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Dịch vụ chính — cấp đầu</option>{options.map(option => <option key={option.id} value={option.id}>{'— '.repeat(option.depth)}{option.title}</option>)}</select></label><Field label="Tên danh mục / gói con" value={itemDraft.title} onChange={e => setItemDraft({ ...itemDraft, title: e.target.value })} placeholder="Ví dụ: Gói tiêu chuẩn" required/></div><Field label="Mô tả ngắn" value={itemDraft.description} onChange={e => setItemDraft({ ...itemDraft, description: e.target.value })} placeholder="Mô tả gói hoặc danh mục"/><div className="two-fields"><Field label="Giá gói (0 nếu chỉ là danh mục)" type="number" min="0" value={itemDraft.price} onChange={e => setItemDraft({ ...itemDraft, price: e.target.value })} placeholder="Ví dụ: 500000"/><Field label="Đơn vị" value={itemDraft.unit} onChange={e => setItemDraft({ ...itemDraft, unit: e.target.value })} placeholder="/ gói"/></div><button className="primary-btn">Thêm vào cấp đã chọn <ChevronRight size={17}/></button></form><div className="item-list">{service.items.length ? <ServiceItemTree items={service.items} parentId={null} depth={0} setParentId={setParentId} deleteItem={deleteItem}/> : <p className="empty-note">Chưa có danh mục nào. Hãy thêm mục cấp đầu tiên.</p>}</div></section>
}
function flattenServiceItems(items, parentId = null, depth = 0) { return items.filter(item => (item.parent_id || null) === parentId).sort((a, b) => a.sort_order - b.sort_order).flatMap(item => [{ ...item, depth }, ...flattenServiceItems(items, item.id, depth + 1)]) }
function ServiceItemTree({ items, parentId, depth, setParentId, deleteItem }) { const children = items.filter(item => (item.parent_id || null) === parentId).sort((a, b) => a.sort_order - b.sort_order); return children.map(item => <div className="tree-branch" key={item.id} style={{ marginLeft: depth ? `${depth * 22}px` : 0 }}><div className="item-row"><div><b>{item.title}</b>{item.description && <small>{item.description}</small>}{Number(item.price) > 0 && <small className="package-price">{money(item.price)}{item.unit || ''}</small>}</div><div className="tree-actions"><button className="ghost-btn" onClick={() => setParentId(item.id)}>Thêm mục con</button><button className="danger-btn" onClick={() => deleteItem(item)}>Xóa</button></div></div><ServiceItemTree items={items} parentId={item.id} depth={depth + 1} setParentId={setParentId} deleteItem={deleteItem}/></div>) }
function statusLabel(status) { return ({ pending: 'Chờ xử lý', processing: 'Đang xử lý', completed: 'Hoàn thành', failed: 'Thất bại', refunded: 'Đã hoàn tiền' })[status] || status }
