import { HttpClient } from '@angular/common/http';
import { NgOptimizedImage } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck,
  LucideChevronRight,
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

interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
}

interface PrecioProducto {
  productoId: number;
  precio: number;
  stock: number;
  actualizado: string;
}

interface LineaCarrito {
  producto: Producto;
  cantidad: number;
}

interface RegistroPedido {
  folio: string;
  fecha: string;
  fechaEntrega: string;
  cliente: string;
  contacto: string;
  metodoPago: string;
  notas: string;
  lineas: LineaCarrito[];
  cantidad: number;
  total: number;
}

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    NgOptimizedImage,
    LucideCheck,
    LucideChevronRight,
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

  productos: Producto[] = [];
  carrito: LineaCarrito[] = [];
  busqueda = '';
  categoriaActiva = 'Todos';
  categorias = ['Todos', 'Cerveza'];
  readonly clientesDemo = ['Bodega San Martín', 'Restaurante El Parque', 'Minimarket Central'];
  clienteActual = this.clientesDemo[0];
  conectado = globalThis.navigator?.onLine ?? true;
  cargando = true;
  errorCatalogo = false;
  checkoutAbierto = false;
  modalRegistrosAbierto = false;
  pedidoRegistrado = false;
  pedidoRechazado = false;
  registroRecienteFolio = '';
  registrosPedidos: RegistroPedido[] = [];
  nombreCliente = '';
  nombreNegocio = '';
  fechaEntrega = this.obtenerFechaRelativa(1);
  metodoPago = 'Crédito 30 días';
  notasPedido = '';
  numeroPedido = '';
  mensajePedido = '';

  ngOnInit(): void {
    this.registrosPedidos = this.cargarRegistros();
    forkJoin({
      catalogo: this.http.get<Producto[]>('/data/catalogo.json'),
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
        this.cargando = false;
      },
      error: () => {
        this.errorCatalogo = true;
        this.cargando = false;
      },
    });
  }

  @HostListener('window:online')
  alConectar(): void {
    this.conectado = true;
  }

  @HostListener('window:offline')
  alDesconectar(): void {
    this.conectado = false;
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

  readonly imagenesProducto: Record<number, string> = {
    1: '/cristal.png',
    2: '/images.png',
    3: '/dorada.png',
  };

  readonly dimensionesImagen: Record<number, { width: number; height: number }> = {
    1: { width: 400, height: 400 },
    2: { width: 447, height: 447 },
    3: { width: 870, height: 1131 },
  };

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

  registrarPedido(): void {
    if (this.carrito.length === 0) return;

    if (!this.conectado) {
      this.pedidoRechazado = true;
      this.numeroPedido = '';
      this.mensajePedido = 'Sin conexión: el pedido no se guardó. Para pedidos offline reales se requiere IndexedDB y sincronización.';
      this.pedidoRegistrado = true;
      this.checkoutAbierto = false;
      return;
    }

    const folio = `BV-${String(Date.now()).slice(-6)}`;
    const registro: RegistroPedido = {
      folio,
      fecha: new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      fechaEntrega: this.fechaEntrega,
      cliente: this.nombreNegocio.trim() || this.clienteActual,
      contacto: this.nombreCliente.trim(),
      metodoPago: this.metodoPago,
      notas: this.notasPedido.trim(),
      lineas: this.carrito.map((linea) => ({ ...linea, producto: { ...linea.producto } })),
      cantidad: this.cantidadTotal,
      total: this.importeTotal,
    };
    this.numeroPedido = folio;
    this.registrosPedidos = [registro, ...this.registrosPedidos];
    this.guardarRegistros();
    this.productos = this.productos.map((producto) => {
      const linea = this.carrito.find((item) => item.producto.id === producto.id);
      return linea ? { ...producto, stock: producto.stock - linea.cantidad } : producto;
    });
    this.clienteActual = registro.cliente;
    this.pedidoRechazado = false;
    this.pedidoRegistrado = true;
    this.registroRecienteFolio = folio;
    this.mensajePedido = 'El pedido quedó guardado en el historial local.';
    this.checkoutAbierto = false;
    this.modalRegistrosAbierto = true;
    this.vaciarCarrito();
    this.nombreCliente = '';
    this.nombreNegocio = '';
    this.notasPedido = '';
    this.fechaEntrega = this.obtenerFechaRelativa(1);
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
      return Array.isArray(registros) ? registros as RegistroPedido[] : [];
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
}
