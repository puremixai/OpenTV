package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/puremixai/OpenTV/services/go-worker/internal/config"
	"github.com/puremixai/OpenTV/services/go-worker/internal/downloads"
	"github.com/puremixai/OpenTV/services/go-worker/internal/httpapi"
	"github.com/puremixai/OpenTV/services/go-worker/internal/openlist"
	"github.com/puremixai/OpenTV/services/go-worker/internal/outbound"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "Check the running worker readiness and exit")
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(*healthcheck); err != nil {
		// Transport errors may contain upstream URLs. Startup errors are deliberately generic.
		slog.Error("worker stopped", "reason", err.Error())
		os.Exit(1)
	}
}

func run(healthcheck bool) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	if healthcheck {
		host, port, _ := net.SplitHostPort(cfg.ListenAddr)
		if host == "" || host == "0.0.0.0" || host == "::" {
			host = "127.0.0.1"
		}
		client := http.Client{Timeout: 5 * time.Second}
		response, err := client.Get("http://" + net.JoinHostPort(host, port) + "/readyz")
		if err != nil {
			return errors.New("worker readiness unavailable")
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return errors.New("worker is not ready")
		}
		return nil
	}
	scanClient, err := outbound.NewClient(outbound.Options{AllowedOrigins: cfg.AllowedOrigins, Timeout: 30 * time.Second})
	if err != nil {
		return errors.New("invalid worker outbound configuration")
	}
	var downloadHandler http.Handler
	closeDownloads := func(context.Context) error { return nil }
	if cfg.DownloadsEnabled {
		downloadClient, err := outbound.NewClient(outbound.Options{AllowedOrigins: cfg.AllowedOrigins, ProxyURL: cfg.ProxyURL, Timeout: 30 * time.Second})
		if err != nil {
			return errors.New("invalid worker outbound configuration")
		}
		manager, err := downloads.New(downloads.Options{Root: cfg.DownloadDir, Concurrency: cfg.MaxDownloads, SegmentConcurrency: cfg.SegmentConcurrency, Client: downloadClient})
		if err != nil {
			return errors.New("download storage could not be opened; check the volume and worker lock")
		}
		downloadHandler = manager
		closeDownloads = manager.Close
	}
	scanner, err := openlist.New(openlist.Options{Client: scanClient, Concurrency: cfg.ScanConcurrency})
	if err != nil {
		_ = closeDownloads(context.Background())
		return errors.New("scanner configuration is invalid")
	}
	router, err := httpapi.NewRouter(httpapi.Options{Token: cfg.Token, Downloads: downloadHandler, OpenList: scanner})
	if err != nil {
		_ = closeDownloads(context.Background())
		return err
	}
	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		_ = closeDownloads(context.Background())
		return errors.New("worker could not bind its listener")
	}
	server := &http.Server{Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server.BaseContext = func(net.Listener) context.Context { return ctx }
	stopped := make(chan error, 1)
	go func() { stopped <- server.Serve(listener) }()
	slog.Info("worker listening", "address", listener.Addr().String())
	select {
	case <-ctx.Done():
	case err = <-stopped:
		if !errors.Is(err, http.ErrServerClosed) {
			_ = closeDownloads(context.Background())
			return errors.New("worker HTTP server failed")
		}
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	// Stop accepting new work, cancel active downloads, then drain HTTP requests.
	_ = listener.Close()
	closeErr := closeDownloads(shutdownCtx)
	serverErr := server.Shutdown(shutdownCtx)
	if closeErr != nil || serverErr != nil {
		return errors.New("worker shutdown did not finish within its deadline")
	}
	return nil
}
