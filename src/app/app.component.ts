import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck,
  LucideClock,
  LucideMinus,
  LucidePlus,
  LucideSearch,
  LucideShoppingCart,
  LucideStore,
  LucideWifi,
  LucideWifiOff,
  LucideX,
} from '@lucide/angular';
import { catchError, forkJoin, of } from 'rxjs';

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
}

export interface PrecioProducto {
  productoId: number;
  precio: number;
  stock: number;
  actualizado: string;
}

export interface LineaCarrito {
  producto: Producto;
  cantidad: number;
}

export interface RegistroPedido {
  folio: string;
  fecha: string;
  fechaEntrega: string;
  cliente: string;
  contacto: string;
  metodoPago: string;
  notas: string;
  estado: 'PENDIENTE' | 'REGISTRADO';
  lineas: LineaCarrito[];
  cantidad: number;
  total: number;
}

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    LucideCheck,
    LucideClock,
    LucideMinus,
    LucidePlus,
    LucideSearch,
    LucideShoppingCart,
    LucideStore,
    LucideWifi,
    LucideWifiOff,
    LucideX,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly catalogoPorDefecto: Producto[] = [
    { id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 7.5, stock: 120 },
    { id: 2, nombre: 'Pilsen Callao 620 ml', categoria: 'Cerveza', precio: 8.0, stock: 95 },
    { id: 3, nombre: 'Cusqueña 620 ml', categoria: 'Cerveza', precio: 9.0, stock: 70 },
    { id: 4, nombre: 'Agua San Mateo Sin Gas 600 ml', categoria: 'Agua', precio: 2.5, stock: 150 },
    { id: 5, nombre: 'Agua San Mateo Con Gas 600 ml', categoria: 'Agua', precio: 2.5, stock: 130 },
  ];

  productos: Producto[] = [];
  carrito: LineaCarrito[] = [];
  busqueda = '';
  categoriaActiva = 'Todos';
  categorias = ['Todos', 'Cerveza', 'Agua'];
  readonly clientesDemo = ['Bodega San Martín', 'Restaurante El Parque', 'Minimarket Central', 'Distribuidora Los Andes'];
  clienteActual = this.clientesDemo[0];

  // Conexión real y simulación para evaluación
  conectadoReal = globalThis.navigator?.onLine ?? true;
  modoSimuladoOffline = false;

  cargando = true;
  errorCatalogo = false;
  catalogoDesdeCache = false;

  checkoutAbierto = false;
  modalRegistrosAbierto = false;
  pedidoRegistrado = false;
  pedidoRechazado = false;
  registroRecienteFolio = '';
  registrosPedidos: RegistroPedido[] = [];

  // Datos formulario checkout
  nombreCliente = '';
  nombreNegocio = '';
  fechaEntrega = this.obtenerFechaRelativa(1);
  metodoPago = 'Crédito 30 días';
  notasPedido = '';
  numeroPedido = '';
  mensajePedido = '';

  // Datos módulo PWA
  mensajeModulo = '';
  ultimoEstadoModulo = '';
  pedidoGuardadoLocalmente = false;
  pedidoPendienteFolio = '';

  readonly imagenesProducto: Record<number, string> = {
    1: '/real-cristal.jpg',
    2: '/real-pilsen.jpg',
    3: '/real-cusquena.jpg',
    4: '/real-san-mateo-sin-gas.jpg',
    5: '/san-mateo-con-gas.png',
  };

  ngOnInit(): void {
    this.registrosPedidos = this.cargarRegistros();
    this.cargarDatosCatalogo();
  }

  cargarDatosCatalogo(): void {
    this.cargando = true;
    forkJoin({
      catalogo: this.http.get<Producto[]>('/data/catalogo.json').pipe(
        catchError(() => {
          const cache = this.obtenerCatalogoCache();
          this.catalogoDesdeCache = true;
          return of(cache || this.catalogoPorDefecto);
        })
      ),
      precios: this.http.get<PrecioProducto[]>('/data/precios.json').pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ catalogo, precios }) => {
        const preciosPorId = new Map(precios.map((precio) => [precio.productoId, precio]));
        this.productos = catalogo.map((producto) => {
          const precioActual = preciosPorId.get(producto.id);
          return precioActual
            ? { ...producto, precio: precioActual.precio, stock: precioActual.stock }
            : producto;
        });
        this.guardarCatalogoCache(this.productos);
        this.cargando = false;
      },
      error: () => {
        this.productos = this.obtenerCatalogoCache() || this.catalogoPorDefecto;
        this.catalogoDesdeCache = true;
        this.cargando = false;
      },
    });
  }

  forzarEstadoConexion: boolean | null = null;

  @HostListener('window:online')
  alConectar(): void {
    this.conectadoReal = true;
    this.forzarEstadoConexion = null;
    this.sincronizarPedidosPendientes();
  }

  @HostListener('window:offline')
  alDesconectar(): void {
    this.conectadoReal = false;
    this.forzarEstadoConexion = null;
    this.catalogoDesdeCache = true;
  }

  @HostListener('window:focus')
  alFoco(): void {
    const estadoNavegador = globalThis.navigator?.onLine ?? true;
    if (this.conectadoReal !== estadoNavegador) {
      this.conectadoReal = estadoNavegador;
      if (!this.conectadoReal) {
        this.catalogoDesdeCache = true;
      } else {
        this.sincronizarPedidosPendientes();
      }
    }
  }

  get conectado(): boolean {
    if (this.forzarEstadoConexion !== null) {
      return this.forzarEstadoConexion;
    }
    return this.conectadoReal;
  }

  get estadoConexion(): string {
    return this.conectado ? 'CONECTADO' : 'SIN CONEXIÓN';
  }

  toggleSimulacionRed(): void {
    const nuevoEstado = !this.conectado;
    this.forzarEstadoConexion = nuevoEstado;
    if (!nuevoEstado) {
      this.catalogoDesdeCache = true;
    } else {
      this.sincronizarPedidosPendientes();
    }
  }

  get productosVisibles(): Producto[] {
    const termino = this.busqueda.trim().toLocaleLowerCase('es');
    return this.productos.filter((producto) => {
      const coincideCategoria = this.categoriaActiva === 'Todos' || producto.categoria === this.categoriaActiva;
      const coincideBusqueda = `${producto.nombre} ${producto.categoria}`.toLocaleLowerCase('es').includes(termino);
      return coincideCategoria && coincideBusqueda;
    });
  }

  get cantidadTotal(): number {
    return this.carrito.reduce((total, linea) => total + linea.cantidad, 0);
  }

  get importeTotal(): number {
    return this.carrito.reduce((total, linea) => total + linea.producto.precio * linea.cantidad, 0);
  }

  get stockDisponibleTotal(): number {
    return this.productos.reduce((total, producto) => total + producto.stock, 0);
  }

  get fechaMinimaEntrega(): string {
    return this.obtenerFechaRelativa(0);
  }

  get cantidadLineas(): number {
    return this.carrito.length;
  }

  get inicialCliente(): string {
    return this.clienteActual.charAt(0).toUpperCase();
  }

  get pedidosPendientesCount(): number {
    return this.registrosPedidos.filter(r => r.estado === 'PENDIENTE').length;
  }

  get fechaActualPrecios(): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date()).replace('.', '');
  }

  get fechaActualLarga(): string {
    return new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date()).toLocaleUpperCase('es-PE');
  }

  formatoPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(precio);
  }

  cantidadEnCarrito(productoId: number): number {
    return this.carrito.find((linea) => linea.producto.id === productoId)?.cantidad ?? 0;
  }

  cambiarCliente(): void {
    const indiceActual = this.clientesDemo.indexOf(this.clienteActual);
    this.clienteActual = this.clientesDemo[(indiceActual + 1) % this.clientesDemo.length];
  }

  agregar(producto: Producto): void {
    const actual = this.cantidadEnCarrito(producto.id);
    if (actual >= producto.stock) return;

    this.carrito = actual
      ? this.carrito.map((linea) => linea.producto.id === producto.id
        ? { ...linea, cantidad: linea.cantidad + 1 }
        : linea)
      : [...this.carrito, { producto, cantidad: 1 }];
    this.pedidoRegistrado = false;
    this.pedidoRechazado = false;
  }

  quitar(productoId: number): void {
    this.carrito = this.carrito
      .map((linea) => linea.producto.id === productoId
        ? { ...linea, cantidad: linea.cantidad - 1 }
        : linea)
      .filter((linea) => linea.cantidad > 0);
  }

  vaciarCarrito(): void {
    this.carrito = [];
  }

  abrirCheckout(): void {
    if (this.carrito.length > 0) {
      this.fechaEntrega = this.fechaEntrega || this.obtenerFechaRelativa(1);
      this.checkoutAbierto = true;
    }
  }

  abrirRegistros(): void {
    this.registroRecienteFolio = '';
    this.modalRegistrosAbierto = true;
  }

  /**
   * Registro desde el Módulo Rápido PWA
   */
  guardarDesdeModulo(): void {
    if (this.carrito.length === 0 && this.productos.length > 0) {
      this.agregar(this.productos[0]);
    }

    if (this.carrito.length === 0) return;

    const nota = this.mensajeModulo.trim() || 'Pedido en ruta';

    if (!this.conectado) {
      // Estado SIN CONEXIÓN
      const folio = `BV-P-${String(Date.now()).slice(-6)}`;
      const registroPendiente: RegistroPedido = {
        folio,
        fecha: new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
        fechaEntrega: this.obtenerFechaRelativa(1),
        cliente: this.clienteActual,
        contacto: 'Vendedor Ruta',
        metodoPago: 'Crédito 30 días',
        notas: nota,
        estado: 'PENDIENTE',
        lineas: this.carrito.map((linea) => ({ ...linea, producto: { ...linea.producto } })),
        cantidad: this.cantidadTotal,
        total: this.importeTotal,
      };

      this.registrosPedidos = [registroPendiente, ...this.registrosPedidos];
      this.guardarRegistros();
      this.descontarStock();

      this.pedidoGuardadoLocalmente = true;
      this.pedidoPendienteFolio = folio;
      this.ultimoEstadoModulo = 'Pedido guardado localmente · Estado: PENDIENTE';
      this.mensajePedido = 'Pedido guardado localmente. Estado: PENDIENTE';
      this.pedidoRechazado = true;
      this.pedidoRegistrado = true;
      this.numeroPedido = folio;
      this.vaciarCarrito();
      return;
    }

    // Estado CONECTADO
    const folio = `BV-${String(Date.now()).slice(-6)}`;
    const registro: RegistroPedido = {
      folio,
      fecha: new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      fechaEntrega: this.obtenerFechaRelativa(1),
      cliente: this.clienteActual,
      contacto: 'Vendedor Ruta',
      metodoPago: 'Crédito 30 días',
      notas: nota,
      estado: 'REGISTRADO',
      lineas: this.carrito.map((linea) => ({ ...linea, producto: { ...linea.producto } })),
      cantidad: this.cantidadTotal,
      total: this.importeTotal,
    };

    this.registrosPedidos = [registro, ...this.registrosPedidos];
    this.guardarRegistros();
    this.descontarStock();

    this.pedidoGuardadoLocalmente = false;
    this.ultimoEstadoModulo = `Pedido ${folio} registrado con éxito`;
    this.numeroPedido = folio;
    this.pedidoRechazado = false;
    this.pedidoRegistrado = true;
    this.mensajePedido = 'Pedido registrado con éxito en el sistema central.';
    this.vaciarCarrito();
  }

  registrarPedido(): void {
    if (this.carrito.length === 0) return;

    if (!this.conectado) {
      const folio = `BV-P-${String(Date.now()).slice(-6)}`;
      const registroPendiente: RegistroPedido = this.crearRegistro(folio, 'PENDIENTE');
      this.registrosPedidos = [registroPendiente, ...this.registrosPedidos];
      this.guardarRegistros();
      this.descontarStock();

      this.pedidoGuardadoLocalmente = true;
      this.pedidoPendienteFolio = folio;
      this.pedidoRechazado = true;
      this.numeroPedido = folio;
      this.mensajePedido = 'Pedido guardado localmente. Estado: PENDIENTE. Se sincronizará al recuperar la conexión.';
      this.pedidoRegistrado = true;
      this.checkoutAbierto = false;
      this.vaciarCarrito();
      this.limpiarFormulario();
      return;
    }

    const folio = `BV-${String(Date.now()).slice(-6)}`;
    const registro = this.crearRegistro(folio, 'REGISTRADO');
    this.numeroPedido = folio;
    this.registrosPedidos = [registro, ...this.registrosPedidos];
    this.guardarRegistros();
    this.descontarStock();

    this.clienteActual = registro.cliente;
    this.pedidoRechazado = false;
    this.pedidoRegistrado = true;
    this.registroRecienteFolio = folio;
    this.mensajePedido = 'El pedido quedó registrado en el sistema.';
    this.checkoutAbierto = false;
    this.modalRegistrosAbierto = true;
    this.vaciarCarrito();
    this.limpiarFormulario();
  }

  sincronizarPedidosPendientes(): void {
    let actualizados = 0;
    this.registrosPedidos = this.registrosPedidos.map(reg => {
      if (reg.estado === 'PENDIENTE') {
        actualizados++;
        return { ...reg, estado: 'REGISTRADO', folio: reg.folio.replace('BV-P-', 'BV-S-') };
      }
      return reg;
    });

    if (actualizados > 0) {
      this.guardarRegistros();
      this.pedidoRegistrado = true;
      this.pedidoRechazado = false;
      this.numeroPedido = 'SINCRO-OK';
      this.mensajePedido = `${actualizados} pedido(s) sincronizado(s) exitosamente.`;
      this.pedidoGuardadoLocalmente = false;
    }
  }

  private descontarStock(): void {
    this.productos = this.productos.map((producto) => {
      const linea = this.carrito.find((item) => item.producto.id === producto.id);
      return linea ? { ...producto, stock: Math.max(0, producto.stock - linea.cantidad) } : producto;
    });
    this.guardarCatalogoCache(this.productos);
  }

  private limpiarFormulario(): void {
    this.nombreCliente = '';
    this.nombreNegocio = '';
    this.notasPedido = '';
    this.fechaEntrega = this.obtenerFechaRelativa(1);
  }

  private crearRegistro(folio: string, estado: RegistroPedido['estado']): RegistroPedido {
    return {
      folio,
      fecha: new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      fechaEntrega: this.fechaEntrega,
      cliente: this.nombreNegocio.trim() || this.clienteActual,
      contacto: this.nombreCliente.trim() || 'Representante',
      metodoPago: this.metodoPago,
      notas: this.notasPedido.trim() || this.mensajeModulo.trim(),
      estado,
      lineas: this.carrito.map((linea) => ({ ...linea, producto: { ...linea.producto } })),
      cantidad: this.cantidadTotal,
      total: this.importeTotal,
    };
  }

  private obtenerFechaRelativa(dias: number): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);
    return fecha.toISOString().slice(0, 10);
  }

  private cargarRegistros(): RegistroPedido[] {
    try {
      const guardados = globalThis.localStorage?.getItem('backus-ventas-registros');
      const registros: unknown = guardados ? JSON.parse(guardados) : [];
      return Array.isArray(registros) ? (registros as RegistroPedido[]) : [];
    } catch {
      return [];
    }
  }

  private guardarRegistros(): void {
    try {
      globalThis.localStorage?.setItem('backus-ventas-registros', JSON.stringify(this.registrosPedidos));
    } catch {
      return;
    }
  }

  private obtenerCatalogoCache(): Producto[] | null {
    try {
      const datos = globalThis.localStorage?.getItem('backus-catalogo-cache');
      return datos ? JSON.parse(datos) : null;
    } catch {
      return null;
    }
  }

  private guardarCatalogoCache(productos: Producto[]): void {
    try {
      globalThis.localStorage?.setItem('backus-catalogo-cache', JSON.stringify(productos));
    } catch {
      return;
    }
  }
}
